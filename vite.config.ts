import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** Dev only: lets the room editor write its layout straight into src/data/layout.json. */
const saveLayout = (): Plugin => ({
  name: 'save-layout',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__save-layout', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        return res.end();
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const layout = JSON.parse(body);
          if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('not an object');
          await writeFile(fileURLToPath(new URL('./src/data/layout.json', import.meta.url)), JSON.stringify(layout, null, 2) + '\n');
          res.statusCode = 204;
        } catch {
          res.statusCode = 400;
        }
        res.end();
      });
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [saveLayout()],
  // served at https://saftladen.test through a Herd proxy (herd proxy saftladen http://127.0.0.1:5173 --secure)
  server: { port: 5173, strictPort: true, host: true, allowedHosts: ['saftladen.test'] },
});
