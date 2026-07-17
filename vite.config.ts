import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

import { manualChunks } from './build/vendorChunks'

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
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: (moduleId) => manualChunks(moduleId) ?? null,
              includeDependenciesRecursively: false,
              priority: 10,
            },
          ],
        },
        strictExecutionOrder: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    maxWorkers: 4,
    testTimeout: 20_000,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
