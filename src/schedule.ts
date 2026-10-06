// Schedule item model and storage, shared by the schedule widget, its editor
// and the reminder scheduler client.

import { type Reminder, defaultReminder, legacyReminder } from './reminder'
import { createStore } from './store'
import { addDays, isWeekend, today, zonedEpoch } from './time'
import { locale } from './locales'

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'weekday'

export type ScheduleItem = {
  id: string
  title: string
  date: string
  time: string
  done: boolean
  repeat?: RepeatKind
  tag?: string
  reminder?: Reminder
}

export const SCHEDULE_KEY = 'desktime.schedule'

export type ScheduleTag = { key: string; label: string; color: string }

// A function rather than a constant: the labels are translated, and a list built
// at module load would hold whichever language was current when this file was
// first imported.
export function defaultTags(): ScheduleTag[] {
  const text = locale().scheduleData
  return [
    { key: 'work', label: text.tagWork, color: '#2563eb' },
    { key: 'life', label: text.tagLife, color: '#16a34a' },
    { key: 'important', label: text.tagImportant, color: '#dc2626' },
    { key: 'study', label: text.tagStudy, color: '#7c3aed' },
  ]
}

// Editable in settings, so the list is a store rather than a constant. An item
// keeps its tag by `key`, which is why renaming or recolouring a tag leaves
// every schedule item alone — and why a deleted key simply stops resolving.
//
// The store starts empty rather than seeded with the built-in list: a seeded
// default would be a second copy of the translated labels, frozen at import.
// `tagsOf` supplies them instead, and only until the user edits the list.
export const tagStore = createStore<{ tags: ScheduleTag[] }>('desktime.tags', {
  tags: [],
})

/**
 * The tags a stored snapshot stands for, falling back to the built-in list while
 * the user has never edited it — which is what lets those four follow the
 * language. Emptiness is read from the *snapshot*, not from the parsed array, so
 * a user who deliberately deleted every tag keeps an empty list.
 */
export function tagsOf(snapshot: string): ScheduleTag[] {
  return snapshot ? tagStore.parse(snapshot).tags : defaultTags()
}

export function tagMapOf(tags: ScheduleTag[]) {
  return new Map(tags.map((tag) => [tag.key, tag]))
}

export function repeats(): { key: RepeatKind; label: string }[] {
  const text = locale().scheduleData
  return [
    { key: 'none', label: text.repeatNone },
    { key: 'daily', label: text.repeatDaily },
    { key: 'weekly', label: text.repeatWeekly },
    { key: 'weekday', label: text.repeatWeekday },
  ]
}

export function repeatLabel(repeat: RepeatKind) {
  return repeats().find((entry) => entry.key === repeat)?.label ?? repeat
}

export function dueTime(item: ScheduleItem) {
  return zonedEpoch(item.date, item.time)
}

export function nextOccurrence(dateStr: string, repeat: RepeatKind) {
  if (repeat === 'daily') return addDays(dateStr, 1)
  if (repeat === 'weekly') return addDays(dateStr, 7)
  if (repeat === 'weekday') {
    let next = addDays(dateStr, 1)
    while (isWeekend(next)) next = addDays(next, 1)
    return next
  }
  return dateStr
}

export function defaultItems(): ScheduleItem[] {
  return [
    {
      id: 'daily-review',
      title: locale().scheduleData.seedTitle,
      date: today(),
      time: '18:00',
      done: false,
      repeat: 'weekday',
      tag: 'work',
      reminder: defaultReminder,
    },
  ]
}

// Items stored before reminders existed carry no `reminder` field. They are
// migrated to the legacy profile (a single system toast) rather than the current
// default, so upgrading never changes how an existing schedule behaves.
export function readSchedule(): ScheduleItem[] {
  try {
    const value = localStorage.getItem(SCHEDULE_KEY)
    if (!value) return defaultItems()

    const items = JSON.parse(value) as ScheduleItem[]
    return items.map((item) => (item.reminder ? item : { ...item, reminder: legacyReminder }))
  } catch {
    return defaultItems()
  }
}

export function saveSchedule(items: ScheduleItem[]) {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(items))
}
