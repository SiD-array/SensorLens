import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('echarts') || id.includes('zrender')) {
            return 'echarts-vendor';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          if (id.includes('lucide-react') || id.includes('@hello-pangea/dnd')) {
            return 'ui-vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
