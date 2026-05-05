import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
    strictPort: true,
    port: 3001,
  },
  optimizeDeps: {
    include: ['react-qr-code']
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
