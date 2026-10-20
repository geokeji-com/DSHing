import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base '/'：assets 用绝对路径引用。不能用 './'——分享页在 /s/<id>，
// 相对路径会被浏览器解析成 /s/assets/… 而 404（10-19 踩过）
// server.proxy：本机开发时把 /api 转给本机跑的 server.mjs（不影响构建产物）
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist' },
  server: { port: 5193, proxy: { '/api': 'http://127.0.0.1:8793', '/collab': { target: 'ws://127.0.0.1:8793', ws: true } } },
})
