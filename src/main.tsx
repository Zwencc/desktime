/* oxlint-disable react/only-export-components --
   The rule keeps React Fast Refresh working by asking a module that defines
   components to export them. This module exports nothing on purpose: it is the
   entry point, it calls `createRoot`, and it is never the target of a refresh.
   The six below are `lazy` handles, not component definitions. */
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import './index.css'
import { hydrateConfig, installConfigPersistence } from './config.ts'
import { RELOAD_EVENT } from './devtools.ts'
import { isTauri } from './env.ts'
import { installLocale } from './locales'
import { installTheme } from './theme.ts'

// Every window loads this same entry and picks its view from `?panel=`.
const panel = new URLSearchParams(window.location.search).get('panel')

// **Imported lazily, one chunk each.** These six are the whole app between
// them, and a window needs exactly one: statically importing all six meant the
// clock window downloading and parsing CodeMirror, the settings pages and the
// DevTools panel to draw a clock face — nine windows over, every launch. The
// import starts the moment the window knows which panel it is, so the only
// thing deferred is the code no window on this URL will ever run.
const App = lazy(() => import('./App.tsx'))
const ContextMenuWindow = lazy(() =>
  import('./ContextMenuWindow.tsx').then((module) => ({ default: module.ContextMenuWindow })),
)
const DevToolsWindow = lazy(() =>
  import('./DevToolsWindow.tsx').then((module) => ({ default: module.DevToolsWindow })),
)
const LauncherWindow = lazy(() =>
  import('./LauncherWindow.tsx').then((module) => ({ default: module.LauncherWindow })),
)
const ReminderWindow = lazy(() =>
  import('./ReminderWindow.tsx').then((module) => ({ default: module.ReminderWindow })),
)
const SettingsWindow = lazy(() =>
  import('./SettingsWindow.tsx').then((module) => ({ default: module.SettingsWindow })),
)

// Developer mode's "reload all windows": a window can only reload itself, so
// every window listens and the broadcast does the rest.
if (isTauri) {
  void listen(RELOAD_EVENT, () => window.location.reload())
}

function root() {
  if (panel === 'menu') return <ContextMenuWindow />
  if (panel === 'reminder') return <ReminderWindow />
  if (panel === 'settings') return <SettingsWindow />
  if (panel === 'launcher') return <LauncherWindow />
  if (panel === 'devtools') return <DevToolsWindow />
  return <App />
}

// The one await before the first render, and the reason every component below
// can still read settings synchronously: localStorage is caught up with the
// file first, so nothing has to know the config lives on disk.
//
// The theme has to follow it rather than lead — reading the palette before the
// file arrived would paint one frame in the previous theme.
async function start() {
  await hydrateConfig()
  installConfigPersistence()

  // Before the first render, so no window flashes the default palette or the
  // wrong language. Every window runs both, which is how they all follow a
  // change made in the settings window.
  installTheme()
  installLocale()

  // `null` rather than a spinner: every window is transparent and frameless,
  // and the widgets are still hidden at this point — `panels.ts` reveals them
  // once they have rendered. A placeholder would be the only thing on screen
  // that ever flashed.
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Suspense fallback={null}>{root()}</Suspense>
    </StrictMode>,
  )
}

void start()
