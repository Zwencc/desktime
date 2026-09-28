// App-wide theming.
//
// A theme is just the set of CSS variables declared at the top of App.css. The
// default values live there as well as here on purpose: the stylesheet has to
// render correctly before any JavaScript runs, or every window would flash the
// wrong colours on startup.
//
// Each window applies the theme to its own :root — a WebView cannot reach into
// another window's DOM — and they stay in step through the settings store, which
// already carries changes across windows and back into the writing window.

import { readSettings, subscribeSettings } from './settings'

export type ThemeId = 'default' | 'cyber' | 'concrete' | 'fish' | 'bossAway' | 'paper'

export type Theme = {
  id: ThemeId
  /** True when the theme is dark, for anything that has to branch on it. */
  dark: boolean
  vars: Record<string, string>
}

/** The default theme, and the complete list of variables a theme may set. */
const base: Record<string, string> = {
  '--ink': '#0f172a',
  '--ink-soft': '#1e293b',
  '--ink-muted': '#475569',
  '--ink-faint': '#64748b',
  '--ink-ghost': '#94a3b8',
  '--ink-line': '#cbd5e1',

  '--accent': '#2563eb',
  '--accent-strong': '#1d4ed8',
  '--accent-deep': '#1e3a8a',
  '--accent-rgb': '37, 99, 235',
  '--accent-soft-rgb': '59, 130, 246',
  '--accent-pale-rgb': '96, 165, 250',

  '--panel-top': 'rgba(219, 239, 255, 0.95)',
  '--panel-bottom': 'rgba(188, 224, 255, 0.84)',
  '--panel-base': 'rgba(219, 239, 255, 0.88)',

  '--card-top': 'rgba(233, 244, 255, 0.98)',
  '--card-bottom': 'rgba(211, 231, 255, 0.95)',
  '--card-flat': 'rgba(240, 248, 255, 0.99)',

  '--chip': 'rgba(191, 219, 254, 0.94)',
  '--chip-cool': 'rgba(186, 230, 253, 0.84)',
  '--chip-rgb': '219, 234, 254',
  '--surface-rgb': '255, 255, 255',
  '--highlight-rgb': '255, 255, 255',
  '--shadow-rgb': '15, 23, 42',
  '--on-accent': '#ffffff',

  '--danger': '#dc2626',
  '--danger-strong': '#b91c1c',
  '--danger-rgb': '220, 38, 38',
  '--danger-bg': 'rgba(254, 226, 226, 0.9)',
  '--danger-bg-soft': 'rgba(254, 226, 226, 0.5)',
  '--danger-edge': 'rgba(254, 202, 202, 0.95)',
  '--warn': '#b45309',
  '--warn-accent': '#f59e0b',
  '--warn-bg': 'rgba(254, 240, 199, 0.98)',
  '--warn-edge': 'rgba(253, 224, 148, 0.96)',
  '--warn-wash': 'rgba(255, 247, 237, 0.92)',
  '--warn-glow-rgb': '251, 191, 36',
  '--warn-ring-rgb': '251, 146, 60',
  '--success': '#16a34a',
  '--tag': '#7c3aed',
  '--neutral': '#78716c',
  '--cool': '#0369a1',
  '--cool-strong': '#075985',
}

/**
 * A theme carries no display name: that is the one translated thing about it,
 * and a name baked in here would freeze whichever language was current when this
 * module was first imported. The settings page looks the name up by id.
 */
function theme(id: ThemeId, dark: boolean, overrides: Record<string, string>): Theme {
  return { id, dark, vars: { ...base, ...overrides } }
}

// Dark themes share the same problem: the semantic colours are tuned for light
// backgrounds and go muddy on dark ones, so they are lifted rather than reused.
const darkSemantics: Record<string, string> = {
  '--danger': '#f87171',
  '--danger-strong': '#fca5a5',
  '--danger-rgb': '248, 113, 113',
  '--danger-bg': 'rgba(69, 26, 26, 0.92)',
  '--danger-bg-soft': 'rgba(69, 26, 26, 0.55)',
  '--danger-edge': 'rgba(127, 29, 29, 0.95)',
  '--warn': '#fbbf24',
  '--warn-accent': '#fcd34d',
  '--warn-bg': 'rgba(69, 49, 12, 0.95)',
  '--warn-edge': 'rgba(120, 82, 15, 0.96)',
  '--warn-wash': 'rgba(48, 36, 16, 0.92)',
  '--success': '#4ade80',
  '--tag': '#c084fc',
  '--neutral': '#a8a29e',
}

export const themes: Theme[] = [
  theme('default', false, {}),

  theme('cyber', true, {
    ...darkSemantics,
    '--ink': '#e2e8f0',
    '--ink-soft': '#cbd5e1',
    '--ink-muted': '#94a3b8',
    '--ink-faint': '#7d8da3',
    '--ink-ghost': '#64748b',
    '--ink-line': '#334155',
    '--accent': '#22d3ee',
    '--accent-strong': '#67e8f9',
    '--accent-deep': '#a5f3fc',
    '--accent-rgb': '34, 211, 238',
    '--accent-soft-rgb': '34, 211, 238',
    '--accent-pale-rgb': '167, 139, 250',
    '--panel-top': 'rgba(17, 26, 48, 0.93)',
    '--panel-bottom': 'rgba(4, 9, 24, 0.9)',
    '--panel-base': 'rgba(10, 16, 34, 0.92)',
    '--card-top': 'rgba(24, 35, 60, 0.97)',
    '--card-bottom': 'rgba(12, 19, 38, 0.97)',
    '--card-flat': 'rgba(14, 22, 42, 0.98)',
    '--chip': 'rgba(30, 58, 88, 0.94)',
    '--chip-cool': 'rgba(14, 60, 76, 0.9)',
    '--chip-rgb': '30, 51, 82',
    '--surface-rgb': '10, 18, 36',
    '--highlight-rgb': '125, 211, 252',
    '--shadow-rgb': '0, 0, 0',
    '--on-accent': '#04121a',
    '--cool': '#38bdf8',
    '--cool-strong': '#7dd3fc',
  }),

  theme('concrete', false, {
    '--ink': '#292524',
    '--ink-soft': '#44403c',
    '--ink-muted': '#57534e',
    '--ink-faint': '#78716c',
    '--ink-ghost': '#a8a29e',
    '--ink-line': '#d6d3d1',
    '--accent': '#57534e',
    '--accent-strong': '#44403c',
    '--accent-deep': '#292524',
    '--accent-rgb': '87, 83, 78',
    '--accent-soft-rgb': '120, 113, 108',
    '--accent-pale-rgb': '168, 162, 158',
    '--panel-top': 'rgba(231, 229, 228, 0.95)',
    '--panel-bottom': 'rgba(206, 203, 201, 0.88)',
    '--panel-base': 'rgba(231, 229, 228, 0.9)',
    '--card-top': 'rgba(245, 245, 244, 0.98)',
    '--card-bottom': 'rgba(226, 224, 222, 0.95)',
    '--card-flat': 'rgba(250, 250, 249, 0.99)',
    '--chip': 'rgba(214, 211, 209, 0.94)',
    '--chip-cool': 'rgba(214, 211, 209, 0.84)',
    '--chip-rgb': '231, 229, 228',
    '--cool': '#57534e',
    '--cool-strong': '#292524',
  }),

  theme('fish', false, {
    '--ink': '#14342a',
    '--ink-soft': '#1c4b3c',
    '--ink-muted': '#3f6b5c',
    '--ink-faint': '#5f8a7a',
    '--ink-ghost': '#94b8ab',
    '--ink-line': '#c3ded3',
    '--accent': '#0f9b6c',
    '--accent-strong': '#0b7c56',
    '--accent-deep': '#0a5b40',
    '--accent-rgb': '15, 155, 108',
    '--accent-soft-rgb': '34, 178, 128',
    '--accent-pale-rgb': '110, 209, 178',
    '--panel-top': 'rgba(223, 244, 235, 0.95)',
    '--panel-bottom': 'rgba(190, 227, 213, 0.86)',
    '--panel-base': 'rgba(223, 244, 235, 0.9)',
    '--card-top': 'rgba(236, 250, 244, 0.98)',
    '--card-bottom': 'rgba(211, 238, 227, 0.95)',
    '--card-flat': 'rgba(242, 252, 248, 0.99)',
    '--chip': 'rgba(197, 233, 220, 0.94)',
    '--chip-cool': 'rgba(186, 235, 226, 0.84)',
    '--chip-rgb': '214, 240, 231',
    '--cool': '#0d7f74',
    '--cool-strong': '#0a5f57',
  }),

  theme('bossAway', false, {
    '--ink': '#4a2410',
    '--ink-soft': '#6b3517',
    '--ink-muted': '#8a4a24',
    '--ink-faint': '#a9683c',
    '--ink-ghost': '#c99a76',
    '--ink-line': '#efd2b8',
    '--accent': '#ea6a1e',
    '--accent-strong': '#c9520f',
    '--accent-deep': '#8a3b0c',
    '--accent-rgb': '234, 106, 30',
    '--accent-soft-rgb': '247, 143, 74',
    '--accent-pale-rgb': '252, 186, 133',
    '--panel-top': 'rgba(255, 236, 213, 0.95)',
    '--panel-bottom': 'rgba(253, 209, 165, 0.86)',
    '--panel-base': 'rgba(255, 236, 213, 0.9)',
    '--card-top': 'rgba(255, 244, 228, 0.98)',
    '--card-bottom': 'rgba(254, 224, 190, 0.95)',
    '--card-flat': 'rgba(255, 249, 240, 0.99)',
    '--chip': 'rgba(254, 222, 189, 0.94)',
    '--chip-cool': 'rgba(253, 230, 175, 0.84)',
    '--chip-rgb': '255, 236, 214',
    '--cool': '#c2410c',
    '--cool-strong': '#7c2d12',
  }),

  theme('paper', false, {
    '--ink': '#2b2a26',
    '--ink-soft': '#403e37',
    '--ink-muted': '#5c584d',
    '--ink-faint': '#7d7869',
    '--ink-ghost': '#a5a091',
    '--ink-line': '#ddd8c8',
    '--accent': '#8a6a3f',
    '--accent-strong': '#6d5231',
    '--accent-deep': '#4a3720',
    '--accent-rgb': '138, 106, 63',
    '--accent-soft-rgb': '169, 141, 99',
    '--accent-pale-rgb': '205, 186, 152',
    '--panel-top': 'rgba(248, 244, 233, 0.96)',
    '--panel-bottom': 'rgba(235, 228, 210, 0.9)',
    '--panel-base': 'rgba(248, 244, 233, 0.92)',
    '--card-top': 'rgba(252, 249, 240, 0.98)',
    '--card-bottom': 'rgba(240, 234, 219, 0.96)',
    '--card-flat': 'rgba(253, 251, 245, 0.99)',
    '--chip': 'rgba(235, 228, 210, 0.94)',
    '--chip-cool': 'rgba(232, 226, 206, 0.86)',
    '--chip-rgb': '243, 238, 226',
    '--cool': '#7a6440',
    '--cool-strong': '#4a3720',
  }),
]

const byId = new Map(themes.map((entry) => [entry.id, entry]))

/** Falls back to the default for an id from an older or newer build. */
export function themeOf(id: string): Theme {
  return byId.get(id as ThemeId) ?? themes[0]
}

/** Writes a theme onto this window's :root. */
/**
 * Key the resolved palette is mirrored to, for plugin windows.
 *
 * A plugin page is not part of the React app and cannot run this module, so it
 * cannot resolve a theme id into variables. The host hands it the finished set
 * (see `plugin_theme`), and this is where that set is published from — written
 * on every theme change so a plugin opened later still gets the current one.
 */
const VARIABLES_KEY = 'desktime.theme.variables'

export function applyTheme(id: string) {
  const { style } = document.documentElement
  const { vars } = themeOf(id)
  Object.entries(vars).forEach(([name, value]) => style.setProperty(name, value))
  localStorage.setItem(VARIABLES_KEY, JSON.stringify(vars))
}

/**
 * Applies the stored theme now and on every later change, from this window or
 * any other. Call once per window; returns the unsubscribe.
 */
export function installTheme() {
  applyTheme(readSettings().theme)
  return subscribeSettings((next) => applyTheme(next.theme))
}
