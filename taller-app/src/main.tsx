import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registro del service worker (PWA instalable) — hecho a mano, sin
// vite-plugin-pwa (no es dependencia del proyecto). Se registra tras el
// 'load' para no competir con la carga inicial de la app, y en silencio si
// falla (navegadores sin soporte, o en desarrollo local con http) — nunca
// bloquea el arranque de TallerGo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin ruido: un fallo de registro (p. ej. en local sin HTTPS) no debe
      // interrumpir ni avisar dentro de la app — el service worker es solo
      // un extra de instalabilidad, no algo de lo que dependa la app.
    });
  });
}
