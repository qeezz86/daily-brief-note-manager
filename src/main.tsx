import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { AppProviders } from './app/providers'
import './styles/global.css'

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker(true)
  },
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
