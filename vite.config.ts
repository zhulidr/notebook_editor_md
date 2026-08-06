import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    target: 'esnext',
    sourcemap: false, // 产物不做 sourcemap，减小 dist 体积（进入 Tauri 安装包）
    emptyOutDir: true, // 每次构建清空 dist，避免历史 hashed chunk 堆积
    rollupOptions: {
      output: {
        manualChunks: {
          katex: ['katex'],
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/search',
            '@codemirror/lang-markdown',
          ],
          markdown: ['markdown-it'],
        },
      },
    },
  },
});
