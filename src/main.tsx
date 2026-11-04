import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'sweetalert2/dist/sweetalert2.min.css'
import './styles/global.css'
import { App } from './app/App'
import { AppProviders } from './app/providers'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" richColors closeButton duration={3600} toastOptions={{ className: 'lf-toast' }} />
      </BrowserRouter>
    </AppProviders>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
}
