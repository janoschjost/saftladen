import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // served at https://saftladen.test through a Herd proxy (herd proxy saftladen http://127.0.0.1:5173 --secure)
  server: { port: 5173, strictPort: true, host: true, allowedHosts: ['saftladen.test'] },
});
