// True when running inside the Tauri shell (WebView2), false in the `npm run dev` browser.
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
