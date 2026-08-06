fn main() {
    // 强制 cargo 在 dist 目录变化时重新编译（确保 generate_context! 重新嵌入新 dist）
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
