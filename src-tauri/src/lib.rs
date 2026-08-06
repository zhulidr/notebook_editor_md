// Rust 命令实现（ARCHITECTURE.md §6 Tauri 命令表）
// 文件对话框用 rfd，打开链接用 open，避免引入 JS 插件包
use serde::Serialize;
use std::fs;
use std::sync::OnceLock;
use tauri::AppHandle;

// 全局 AppHandle：键盘钩子回调中用于 emit 事件给前端
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

// Windows 键盘钩子：拦截 Ctrl+P，阻止 WebView2 浏览器加速键触发打印对话框。
// 钩子返回 1 阻止按键传递给 WebView2，同时 emit "ctrl-p" 事件给前端执行 insertTable。
#[cfg(target_os = "windows")]
mod win_keyboard_hook {
    use super::APP_HANDLE;
    use tauri::Emitter;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_P};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, KBDLLHOOKSTRUCT, SetWindowsHookExW, WH_KEYBOARD_LL,
    };

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            // 拦截 Ctrl+P（VK_P=0x50）：阻止 WebView2 触发打印对话框，emit 事件给前端
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
            // WH_KEYBOARD_LL：低级键盘钩子，在系统层面拦截，不需要 DLL 注入
            let _ = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0);
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
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

// 原子写：先写 .tmp 再 rename（防断电丢档，需求 FR-7.2）
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    let tmp = format!("{}.tmp", path);
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

// 文件树（M3）：列目录，仅保留子目录与 .md/.markdown/.canvas 文件
#[tauri::command]
async fn read_dir(path: String) -> Result<Vec<FileEntry>, String> {
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
async fn pick_open_file() -> Result<Option<String>, String> {
    let f = rfd::AsyncFileDialog::new()
        .add_filter("Markdown / Canvas", &["md", "markdown", "canvas"])
        .pick_file()
        .await;
    Ok(f.map(|h| h.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn pick_save_file(default_name: String) -> Result<Option<String>, String> {
    // 根据默认文件名扩展名动态选择过滤器：导出 HTML/PDF 时允许对应扩展名
    let ext = default_name.rsplit('.').next().unwrap_or("").to_lowercase();
    let mut d = rfd::AsyncFileDialog::new();
    match ext.as_str() {
        "html" | "htm" => {
            d = d.add_filter("HTML", &["html", "htm"]).add_filter("Markdown", &["md", "markdown"]);
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
    Ok(d.save_file().await.map(|h| h.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    Ok(rfd::AsyncFileDialog::new()
        .pick_folder()
        .await
        .map(|h| h.path().to_string_lossy().to_string()))
}

// 外部链接打开（需求 FR-2.4 桌面版）
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 安装键盘钩子拦截 Ctrl+P（阻止 WebView2 打印对话框）
    #[cfg(target_os = "windows")]
    win_keyboard_hook::install();

    tauri::Builder::default()
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
