import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: false,
    // 处理 CSS：pipeline.ts 用 ?raw 内联 KaTeX 样式，需走 Vite CSS 插件
    css: true,
  },
});
