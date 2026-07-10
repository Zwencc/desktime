// Note templates: the list, and what `{{…}}` turns into.
//
// The files live in `<root>/templates` and are read through the backend; see
// commands/template.rs for why they are files rather than a config blob.
//
// Substitution happens **here rather than in Rust** for the same reason every
// other date in this app does: the backend has no time-zone setting, and a
// template that stamped the machine's local date would contradict the clock
// sitting next to it on the desktop.

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './env'
import { formatDate, formatHm, today, weekdayOf } from './time'
import { locale } from './locales'

export type Template = {
  name: string
  body: string
}

/**
 * Names of the blank template, one per seeded set (see commands/template.rs).
 *
 * File names rather than a translated string, and every set's name is listed
 * rather than the current language's: the backend swaps the built-in set over
 * when the language changes, but only for files the user has not edited, so a
 * folder can legitimately hold the blank template under an older name. Reading
 * all of them costs nothing and misidentifying one puts it in the wrong place
 * in the list.
 */
const BLANK_NAMES = ['空白', 'Blank', 'Vierge', 'Vuoto', 'En blanco', 'Leer']

export function isBlankTemplate(name: string) {
  return BLANK_NAMES.includes(name)
}

export async function listTemplates(): Promise<Template[]> {
  if (!isTauri) return [{ name: BLANK_NAMES[0], body: '' }]

  try {
    const templates = await invoke<Template[]>('template_list')
    // The blank one leads; the rest keep the backend's alphabetical order.
    return [
      ...templates.filter((entry) => isBlankTemplate(entry.name)),
      ...templates.filter((entry) => !isBlankTemplate(entry.name)),
    ]
  } catch {
    return [{ name: BLANK_NAMES[0], body: '' }]
  }
}

export async function writeTemplate(name: string, body: string) {
  if (!isTauri) return
  await invoke('template_write', { name, body })
}

export async function deleteTemplate(name: string) {
  if (!isTauri) return
  await invoke('template_delete', { name })
}

export async function templatesDirectory(): Promise<string> {
  if (!isTauri) return ''

  try {
    return await invoke<string>('templates_directory')
  } catch {
    return ''
  }
}



/**
 * Fills in a template's placeholders.
 *
 * Five variables, and deliberately no more. Conditionals and loops would make
 * this a template engine, and a note template does not need one — anything that
 * complicated is better written as a note and copied.
 */
export function applyTemplate(body: string, title: string): string {
  const now = new Date()
  const date = formatDate(now)
  const time = formatHm(now)

  const values: Record<string, string> = {
    date,
    time,
    datetime: `${date} ${time}`,
    // `today()` and `weekdayOf` both run in the configured zone, so this stays
    // the same day the clock widget is showing.
    weekday: locale().calendar.weekdays[weekdayOf(today())],
    title,
  }

  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole)
}
