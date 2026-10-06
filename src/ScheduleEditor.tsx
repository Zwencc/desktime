// Editing overlay for one schedule item.
//
// Quick-add stayed inline in the widget, but there was previously no way to
// change an item at all — you had to delete it and retype — and the reminder
// options need more room than the two-row form has.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Trash2, X } from 'lucide-react'
import { defaultReminder } from './reminder'
import { ReminderFields } from './ReminderFields'
import { type RepeatKind, type ScheduleItem, repeats, tagStore, tagsOf } from './schedule'
import { useLocale } from './locales'


type ScheduleEditorProps = {
  item: ScheduleItem
  /** True while the item is not in the list yet: no title change, and nothing to delete. */
  isNew?: boolean
  onSave: (item: ScheduleItem) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function ScheduleEditor({ item, isNew, onSave, onDelete, onClose }: ScheduleEditorProps) {
  const strings = useLocale()
  const text = strings.scheduleEditor
  const [draft, setDraft] = useState<ScheduleItem>(() => ({
    ...item,
    reminder: item.reminder ?? defaultReminder,
  }))
  const storedTags = useSyncExternalStore(tagStore.subscribe, tagStore.snapshot)
  const tags = tagsOf(storedTags)

  // Listened for on the window rather than on the card, so Esc closes the
  // overlay wherever the focus happens to be — including nowhere in particular.
  // `data-escape-owner` on the backdrop is what tells the shell to leave Esc
  // alone while this is open, instead of unpinning the widget underneath.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function set<Key extends keyof ScheduleItem>(key: Key, value: ScheduleItem[Key]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function save() {
    const title = draft.title.trim()
    if (!title) return
    onSave({ ...draft, title })
  }

  return (
    <div className="editor-backdrop" data-escape-owner onMouseDown={onClose}>
      <div className="editor-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="editor-header">
          <span>{isNew ? text.newTitle : text.title}</span>
          <button className="icon-button" type="button" onClick={onClose} title={strings.common.close}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <label className="field-row">
          <span>{text.name}</span>
          <input
            className="grow"
            value={draft.title}
            autoFocus
            onChange={(event) => set('title', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
            }}
          />
        </label>

        <div className="field-row">
          <span>{text.date}</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => set('date', event.target.value)}
          />
          <span>{text.time}</span>
          <input
            type="time"
            value={draft.time}
            onChange={(event) => set('time', event.target.value)}
          />
        </div>

        <div className="field-row">
          <span>{text.repeat}</span>
          <select
            value={draft.repeat ?? 'none'}
            onChange={(event) => set('repeat', event.target.value as RepeatKind)}
          >
            {repeats().map((repeat) => (
              <option key={repeat.key} value={repeat.key}>
                {repeat.label}
              </option>
            ))}
          </select>
          <span>{text.tag}</span>
          <select
            value={draft.tag ?? ''}
            onChange={(event) => set('tag', event.target.value || undefined)}
          >
            <option value="">{text.noTag}</option>
            {tags.map((tag) => (
              <option key={tag.key} value={tag.key}>
                {tag.label}
              </option>
            ))}
          </select>
        </div>

        <div className="editor-section">{text.reminder}</div>
        <ReminderFields
          value={draft.reminder ?? defaultReminder}
          onChange={(reminder) => set('reminder', reminder)}
        />

        <div className="editor-footer">
          {/* Deleting something that was never created is what "取消" already
              does, so the button is simply absent while creating. */}
          {!isNew && (
            <button
              type="button"
              className="reminder-button danger"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 size={13} aria-hidden="true" />
              {strings.common.delete}
            </button>
          )}
          <div className="toolbar-spacer" />
          <button type="button" className="reminder-button" onClick={onClose}>
            {strings.common.cancel}
          </button>
          <button type="button" className="reminder-button primary" onClick={save}>
            {strings.common.save}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ScheduleEditor
