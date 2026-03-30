// Schedule item model and storage, shared by the schedule widget, its editor
// and the reminder scheduler client.

import { type Reminder, defaultReminder, legacyReminder } from './reminder'
import { addDays, isWeekend, today, zonedEpoch } from './time'

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

export const TAGS: { key: string; label: string; color: string }[] = [
  { key: 'work', label: '工作', color: '#2563eb' },
  { key: 'life', label: '生活', color: '#16a34a' },
  { key: 'important', label: '重要', color: '#dc2626' },
  { key: 'study', label: '学习', color: '#7c3aed' },
]

export const TAG_MAP = new Map(TAGS.map((tag) => [tag.key, tag]))

export const REPEATS: { key: RepeatKind; label: string }[] = [
  { key: 'none', label: '不重复' },
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'weekday', label: '工作日' },
]

export const REPEAT_LABEL = new Map(REPEATS.map((repeat) => [repeat.key, repeat.label]))

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
      title: '整理今天的重点',
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
