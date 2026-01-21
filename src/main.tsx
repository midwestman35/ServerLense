import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { loadServiceMappings } from './utils/messageCleanup'
import { SpeedInsights } from '@vercel/speed-insights/react'

// Load service mappings before rendering
loadServiceMappings().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
        <SpeedInsights />
      </ErrorBoundary>
      <SpeedInsights />
    </StrictMode>,
  )
});
