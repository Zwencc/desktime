import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ContextMenuWindow } from './ContextMenuWindow.tsx'

const isMenuWindow = new URLSearchParams(window.location.search).get('panel') === 'menu'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMenuWindow ? <ContextMenuWindow /> : <App />}</StrictMode>,
)
