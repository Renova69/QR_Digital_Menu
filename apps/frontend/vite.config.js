import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Read backend origin from VITE_API_URL (e.g. http://192.168.0.3:3000/api → http://192.168.0.3:3000)
  const backendOrigin = (env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

  return {
    plugins: [react(), tsconfigPaths({ root: '.' })],
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
    build: {
      // Split heavy third-party libs out of the main bundle (#5) so the entry
      // chunk shrinks and vendors cache independently across deploys.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory')) return 'charts';
            if (id.includes('@stripe')) return 'stripe';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('react-router') || id.includes('@tanstack')) return 'router-query';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
            return 'vendor';
          },
        },
      },
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
