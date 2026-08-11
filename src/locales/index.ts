// The language layer.
//
// Same shape as `theme.ts`, and for the same reasons: one store, a snapshot for
// `useSyncExternalStore`, and a value that is in place before the first render
// so no window paints a frame in the wrong language.
//
// Two ways in, because not every string is read from a component:
//
//   `useLocale()`  in components — re-renders when the language changes
//   `locale()`     anywhere else — reads the current value, does not subscribe
//
// The second one is what module-level tables have to use, and it is why those
// tables must be **functions rather than constants**: a `const` built at module
// load holds the language that was current when the module was first imported,
// which is not a bug that shows up until someone switches language.

import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../env'
import { readSettings, settingsSnapshot, subscribeSettings, updateSettings } from '../settings'
import { type Locale, zhCN } from './zh-CN'
import { deDE } from './de-DE'
import { enUS } from './en-US'
import { esES } from './es-ES'
import { frFR } from './fr-FR'
import { itIT } from './it-IT'
import { jaJP } from './ja-JP'

export type { Locale }

export type LanguageId = 'zh-CN' | 'en-US' | 'ja-JP' | 'fr-FR' | 'it-IT' | 'es-ES' | 'de-DE'

/**
 * Every language, with the font stack it needs.
 *
 * The fonts are not decoration. "Microsoft YaHei UI" renders Japanese kana and
 * kanji with Chinese glyph shapes — legible, and instantly wrong to a Japanese
 * reader — so ja-JP leads with a Japanese face. The Latin languages lead with
 * Segoe UI, which has the accented characters and none of the CJK baggage.
 */
export const languages: {
  id: LanguageId
  locale: Locale
  /** Value for `font-family`; see the `[data-lang]` rules in index.css. */
  font: string
}[] = [
  { id: 'zh-CN', locale: zhCN, font: '"Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif' },
  { id: 'en-US', locale: enUS, font: '"Segoe UI", system-ui, sans-serif' },
  { id: 'ja-JP', locale: jaJP, font: '"Yu Gothic UI", "Meiryo", "Segoe UI", system-ui, sans-serif' },
  { id: 'fr-FR', locale: frFR, font: '"Segoe UI", system-ui, sans-serif' },
  { id: 'it-IT', locale: itIT, font: '"Segoe UI", system-ui, sans-serif' },
  { id: 'es-ES', locale: esES, font: '"Segoe UI", system-ui, sans-serif' },
  { id: 'de-DE', locale: deDE, font: '"Segoe UI", system-ui, sans-serif' },
]

const byId = new Map(languages.map((entry) => [entry.id, entry]))

/**
 * Where an unrecognised system language lands.
 *
 * English rather than the source locale: someone whose Windows is set to a
 * language DeskTime does not speak can almost certainly read an English
 * interface, and almost certainly cannot read a Chinese one.
 */
export const DEFAULT_LANGUAGE: LanguageId = 'en-US'

/** The stored value that means "whatever Windows is set to". */
export const FOLLOW_SYSTEM = ''

/**
 * The language in force.
 *
 * The stored value is empty until the user picks one — which is not a missing
 * setting but the default, "follow the system". It then guesses from the
 * browser, which in WebView2 is the Windows display language, and an
 * unsupported guess falls back rather than leaving the interface
 * half-translated.
 */
export function currentLanguage(): LanguageId {
  const stored = readSettings().language
  if (stored && byId.has(stored as LanguageId)) return stored as LanguageId

  const guess = navigator.language
  const exact = languages.find((entry) => entry.id === guess)
  if (exact) return exact.id

  // `de` should find `de-DE`; `zh-TW` should not silently become `zh-CN`, but
  // it has nowhere better to go and the script is at least readable.
  const prefix = guess.split('-')[0]
  return languages.find((entry) => entry.id.startsWith(`${prefix}-`))?.id ?? DEFAULT_LANGUAGE
}

export function locale(): Locale {
  return byId.get(currentLanguage())?.locale ?? zhCN
}

/** Components: re-renders this window when the language changes anywhere. */
export function useLocale(): Locale {
  useSyncExternalStore(subscribeSettings, settingsSnapshot)
  return locale()
}

export function setLanguage(id: LanguageId | typeof FOLLOW_SYSTEM) {
  updateSettings({ language: id })
  // The tray menu is native and outside React, so nothing else would notice.
  if (isTauri) void invoke('refresh_tray').catch(() => undefined)
}

/**
 * Whether the lunar calendar, solar terms and almanac lines make sense here.
 *
 * `lunar-javascript` only speaks Chinese, and the almanac is specific to the
 * Chinese calendar — so rather than showing a French user 「甲辰年 惊蛰 宜嫁娶」
 * or a machine translation of it, those rows are not rendered at all. Hiding a
 * row is a smaller lie than translating one badly.
 */
export function showsLunar() {
  return currentLanguage().startsWith('zh')
}

/**
 * Applies the language's font stack and marks the document for CSS.
 *
 * Run once per window at startup, next to `installTheme`, and again whenever the
 * setting changes — every window subscribes, which is how they stay in step.
 */
export function installLocale() {
  function apply() {
    const id = currentLanguage()
    const entry = byId.get(id)
    document.documentElement.setAttribute('lang', id)
    document.documentElement.style.setProperty('--app-font', entry?.font ?? '')
  }

  apply()
  subscribeSettings(apply)
}
