import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Daily Brief Note Content Manager',
        short_name: 'Daily Brief Note',
        description: 'Daily Brief Note 콘텐츠 관리 도구',
        display: 'standalone',
        start_url: '/',
        background_color: '#f4f6f5',
        theme_color: '#173f35',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    maxWorkers: 4,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
