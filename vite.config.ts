import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function disableHmrClientPlugin() {
  return {
    name: 'disable-hmr-client-ws',
    enforce: 'post' as const,
    transform(code: string, id: string) {
      if (id.endsWith('/vite/dist/client/client.mjs') || id.endsWith('\\vite\\dist\\client\\client.mjs')) {
        return code.replace(
          'transport.connect(createHMRHandler(handleMessage));',
          '/* HMR disabled: skip WebSocket connect */'
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), disableHmrClientPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: false,
    ws: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
