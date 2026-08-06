// 轻量 toast 提示（异常场景告警：保存失败/打开失败等）
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string): void {
  let el = document.getElementById('toast') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  // 已在显示时仅更新文字，不重置计时器，避免自动保存连续失败刷屏
  if (!el.classList.contains('show')) {
    el.classList.add('show');
    timer = setTimeout(() => el!.classList.remove('show'), 2600);
  }
}
