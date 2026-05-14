import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Read backend origin from VITE_API_URL (e.g. http://192.168.0.3:3000/api → http://192.168.0.3:3000)
  const backendOrigin = (env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

  return {
    plugins: [react(), tsconfigPaths()],
    server: {
      host: true,
      strictPort: true,
      port: 3001,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendOrigin,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    optimizeDeps: {
      include: ['react-qr-code']
    },
    test: {
      globals: true,
      environment: 'jsdom',
      reporters: [
        'default',
        ['tdd-guard-vitest', { projectRoot: 'F:/PROGRAMING/QR_Digital_Menu-main' }],
      ],
    },
  };
})
