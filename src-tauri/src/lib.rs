// Rust 命令实现（ARCHITECTURE.md §6 Tauri 命令表）
// 文件对话框用 rfd，打开链接用 open，避免引入 JS 插件包
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, State};

// 全局 AppHandle：键盘钩子回调中用于 emit 事件给前端
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

// 所有文件系统命令都必须先由原生文件/目录选择器授权。这样即使 WebView 中
// 出现恶意内容，它也不能把任意路径交给 read_file / write_file / read_dir。
#[derive(Default)]
struct FileAccess {
    files: Mutex<HashSet<PathBuf>>,
    directories: Mutex<HashSet<PathBuf>>,
}

fn canonical_existing_file(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if path.is_file() {
        Ok(path)
    } else {
        Err("目标不是文件".into())
    }
}

fn canonical_existing_dir(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if path.is_dir() {
        Ok(path)
    } else {
        Err("目标不是目录".into())
    }
}

fn canonical_save_file(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return canonical_existing_file(path);
    }
    let file_name = path
        .file_name()
        .ok_or_else(|| "保存路径缺少文件名".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "保存路径缺少父目录".to_string())?;
    Ok(canonical_existing_dir(parent)?.join(file_name))
}

impl FileAccess {
    fn grant_file(&self, path: PathBuf) -> Result<(), String> {
        self.files
            .lock()
            .map_err(|_| "文件访问锁不可用".to_string())?
            .insert(path);
        Ok(())
    }

    fn grant_directory(&self, path: PathBuf) -> Result<(), String> {
        self.directories
            .lock()
            .map_err(|_| "目录访问锁不可用".to_string())?
            .insert(path);
        Ok(())
    }

    fn allows_file(&self, path: &Path) -> Result<bool, String> {
        let explicitly_allowed = self
            .files
            .lock()
            .map_err(|_| "文件访问锁不可用".to_string())?
            .contains(path);
        if explicitly_allowed {
            return Ok(true);
        }
        Ok(self
            .directories
            .lock()
            .map_err(|_| "目录访问锁不可用".to_string())?
            .iter()
            .any(|root| path.starts_with(root)))
    }

    fn allows_directory(&self, path: &Path) -> Result<bool, String> {
        Ok(self
            .directories
            .lock()
            .map_err(|_| "目录访问锁不可用".to_string())?
            .iter()
            .any(|root| path.starts_with(root)))
    }
}

fn require_readable_file(path: &str, access: &FileAccess) -> Result<PathBuf, String> {
    let path = canonical_existing_file(Path::new(path))?;
    if access.allows_file(&path)? {
        Ok(path)
    } else {
        Err("该文件未经用户选择器授权".into())
    }
}

fn require_writable_file(path: &str, access: &FileAccess) -> Result<PathBuf, String> {
    let path = canonical_save_file(Path::new(path))?;
    if access.allows_file(&path)? {
        Ok(path)
    } else {
        Err("该保存位置未经用户选择器授权".into())
    }
}

fn unique_temp_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "保存路径缺少父目录".to_string())?;
    let name = path
        .file_name()
        .ok_or_else(|| "保存路径缺少文件名".to_string())?
        .to_string_lossy();
    let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    Ok(parent.join(format!(".{name}.{}.{}.tmp", std::process::id(), sequence)))
}

// Windows 键盘钩子：拦截 Ctrl+P，阻止 WebView2 浏览器加速键触发打印对话框。
// 钩子返回 1 阻止按键传递给 WebView2，同时 emit "ctrl-p" 事件打开前端命令面板。
#[cfg(target_os = "windows")]
mod win_keyboard_hook {
    use super::APP_HANDLE;
    use std::sync::{Mutex, OnceLock};
    use tauri::Emitter;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_P};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetForegroundWindow, GetWindowThreadProcessId, SetWindowsHookExW,
        UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    // HHOOK 内部是裸指针；静态存储为数值句柄，卸载时再还原为 HHOOK。
    static HOOK: OnceLock<Mutex<Option<isize>>> = OnceLock::new();

    fn app_is_foreground() -> bool {
        unsafe {
            let window = GetForegroundWindow();
            if window.0.is_null() {
                return false;
            }
            let mut process_id = 0;
            GetWindowThreadProcessId(window, Some(&mut process_id));
            process_id == GetCurrentProcessId()
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0
            && (wparam.0 == WM_KEYDOWN as usize || wparam.0 == WM_SYSKEYDOWN as usize)
            && app_is_foreground()
        {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            // 只在 Notebook MD 位于前台时拦截 Ctrl+P，绝不能影响其他软件。
            if kb.vkCode == VK_P.0 as u32 && GetAsyncKeyState(VK_CONTROL.0 as i32) < 0 {
                if let Some(app) = APP_HANDLE.get() {
                    let _ = app.emit("ctrl-p", ());
                }
                return LRESULT(1);
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    pub fn install() {
        unsafe {
            // WH_KEYBOARD_LL 仍需系统回调，但只消费前台应用自己的 Ctrl+P。
            let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) {
                Ok(hook) => hook,
                Err(error) => {
                    eprintln!("无法安装 Ctrl+P 键盘钩子：{error}");
                    return;
                }
            };
            if let Ok(mut stored) = HOOK.get_or_init(|| Mutex::new(None)).lock() {
                *stored = Some(hook.0 as isize);
            }
        }
    }

    pub fn uninstall() {
        if let Some(lock) = HOOK.get() {
            if let Ok(mut stored) = lock.lock() {
                if let Some(hook) = stored.take() {
                    unsafe {
                        let _ = UnhookWindowsHookEx(HHOOK(hook as _));
                    }
                }
            }
        }
    }
}

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
async fn read_file(path: String, access: State<'_, FileAccess>) -> Result<String, String> {
    let path = require_readable_file(&path, &access)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

// 原子写：临时文件位于目标文件同目录。每次写入使用唯一名称，避免自动保存和
// 手动保存并发时共用同一个 `.tmp` 文件。
#[tauri::command]
async fn write_file(
    path: String,
    content: String,
    access: State<'_, FileAccess>,
) -> Result<(), String> {
    let path = require_writable_file(&path, &access)?;
    let tmp = unique_temp_path(&path)?;
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

// 文件树（M3）：列目录，仅保留子目录与 .md/.markdown/.canvas 文件
#[tauri::command]
async fn read_dir(path: String, access: State<'_, FileAccess>) -> Result<Vec<FileEntry>, String> {
    let path = canonical_existing_dir(Path::new(&path))?;
    if !access.allows_directory(&path)? {
        return Err("该目录未经用户选择器授权".into());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        let p = e.path();
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let ok = is_dir
            || p.extension()
                .map(|x| x == "md" || x == "markdown" || x == "canvas")
                .unwrap_or(false);
        if ok {
            out.push(FileEntry {
                name: e.file_name().to_string_lossy().to_string(),
                path: p.to_string_lossy().to_string(),
                is_dir,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
async fn pick_open_file(access: State<'_, FileAccess>) -> Result<Option<String>, String> {
    let f = rfd::AsyncFileDialog::new()
        .add_filter("Markdown / Canvas", &["md", "markdown", "canvas"])
        .pick_file()
        .await;
    match f {
        Some(handle) => {
            let path = canonical_existing_file(handle.path())?;
            access.grant_file(path.clone())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn pick_save_file(
    default_name: String,
    access: State<'_, FileAccess>,
) -> Result<Option<String>, String> {
    // 根据默认文件名扩展名动态选择过滤器：导出 HTML/PDF 时允许对应扩展名
    let ext = default_name.rsplit('.').next().unwrap_or("").to_lowercase();
    let mut d = rfd::AsyncFileDialog::new();
    match ext.as_str() {
        "html" | "htm" => {
            d = d
                .add_filter("HTML", &["html", "htm"])
                .add_filter("Markdown", &["md", "markdown"]);
        }
        "pdf" => {
            d = d.add_filter("PDF", &["pdf"]);
        }
        _ => {
            d = d.add_filter("Markdown", &["md", "markdown"]);
        }
    }
    if !default_name.is_empty() {
        d = d.set_file_name(default_name);
    }
    match d.save_file().await {
        Some(handle) => {
            let path = canonical_save_file(handle.path())?;
            access.grant_file(path.clone())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn pick_folder(access: State<'_, FileAccess>) -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .pick_folder()
        .await
        .map(|h| h.path().to_path_buf());
    match folder {
        Some(path) => {
            let path = canonical_existing_dir(&path)?;
            access.grant_directory(path.clone())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

fn is_safe_external_url(url: &str) -> bool {
    let url = url.trim();
    !url.is_empty()
        && !url.chars().any(char::is_control)
        && (url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:"))
}

// 外部链接打开（需求 FR-2.4 桌面版）：只允许常见的 Web/mailto 协议。
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    if !is_safe_external_url(&url) {
        return Err("仅支持 http、https 或 mailto 链接".into());
    }
    open::that(&url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .manage(FileAccess::default())
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            // 安装键盘钩子拦截 Ctrl+P（阻止 WebView2 打印对话框）。APP_HANDLE
            // 先就绪，且退出后会明确卸载该 hook。
            #[cfg(target_os = "windows")]
            win_keyboard_hook::install();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            read_dir,
            pick_open_file,
            pick_save_file,
            pick_folder,
            open_url
        ])
        .run(tauri::generate_context!());

    #[cfg(target_os = "windows")]
    win_keyboard_hook::uninstall();

    result.expect("error while running tauri application");
}
