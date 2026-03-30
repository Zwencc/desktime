import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ContextMenuWindow } from './ContextMenuWindow.tsx'
import { ReminderWindow } from './ReminderWindow.tsx'
import { SettingsWindow } from './SettingsWindow.tsx'

// Every window loads the same bundle and picks its view from `?panel=`.
const panel = new URLSearchParams(window.location.search).get('panel')

function root() {
  if (panel === 'menu') return <ContextMenuWindow />
  if (panel === 'reminder') return <ReminderWindow />
  if (panel === 'settings') return <SettingsWindow />
  return <App />
}

createRoot(document.getElementById('root')!).render(<StrictMode>{root()}</StrictMode>)
