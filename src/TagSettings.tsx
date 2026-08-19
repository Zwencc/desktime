// The "日程类型" section of the settings window.
//
// Items reference a tag by `key`, never by name or colour, so renaming and
// recolouring here leave every schedule item alone. Deleting is the one case
// that reaches into the schedule, and it is the schedule widget that does it —
// see the cleanup effect in SchedulePanel, which owns the item list and would
// otherwise overwrite anything written from this window.

import { useSyncExternalStore } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { type ScheduleTag, defaultTags, tagStore, tagsOf } from './schedule'
import { useLocale } from './locales'


/** A colour far enough from the existing ones to be told apart at chip size. */
const NEW_TAG_COLOR = '#0891b2'

export function TagSettings() {
  const strings = useLocale()
  const text = strings.tagSettings
  const stored = useSyncExternalStore(tagStore.subscribe, tagStore.snapshot)
  const tags = tagsOf(stored)

  function patch(key: string, next: Partial<ScheduleTag>) {
    tagStore.save({
      tags: tags.map((tag) => (tag.key === key ? { ...tag, ...next } : tag)),
    })
  }

  function add() {
    tagStore.save({
      tags: [
        ...tags,
        // A fresh id rather than a name-derived key: renaming must not orphan
        // the items already tagged with it.
        { key: crypto.randomUUID(), label: text.untitled, color: NEW_TAG_COLOR },
      ],
    })
  }

  function remove(key: string) {
    tagStore.save({ tags: tags.filter((tag) => tag.key !== key) })
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>

      {tags.map((tag) => (
        <div className="field-row" key={tag.key}>
          <input
            type="color"
            className="tag-color"
            value={tag.color}
            title={text.color}
            onChange={(event) => patch(tag.key, { color: event.target.value })}
          />
          <input
            className="grow"
            value={tag.label}
            title={text.name}
            onChange={(event) => patch(tag.key, { label: event.target.value })}
          />
          <span className="tag-chip" style={{ background: tag.color }}>
            {tag.label}
          </span>
          <button
            type="button"
            className="icon-button"
            title={strings.common.delete}
            onClick={() => remove(tag.key)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ))}

      <div className="field-row">
        <button type="button" className="reminder-button" onClick={add}>
          <Plus size={13} aria-hidden="true" />
          {text.add}
        </button>
        <button
          type="button"
          className="reminder-button"
          onClick={() => tagStore.save({ tags: defaultTags() })}
        >
          {text.reset}
        </button>
      </div>
    </section>
  )
}

export default TagSettings
