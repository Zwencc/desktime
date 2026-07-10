// The "模板" settings page.
//
// A template is a markdown file, so it is edited in the markdown editor the
// notebook already has rather than in a second one written for this page. The
// list on the left is the folder; saving writes the file.

import { useCallback, useEffect, useState } from 'react'
import { FilePlus2, FolderOpen, Trash2 } from 'lucide-react'
import { useLocale } from './locales'
import { NoteEditor } from './NoteEditor'
import { openInExplorer } from './notebook'
import {
  type Template,
  isBlankTemplate,
  deleteTemplate,
  listTemplates,
  templatesDirectory,
  writeTemplate,
} from './templates'

export function TemplateSettings() {
  const strings = useLocale()
  const text = strings.templates
  const [templates, setTemplates] = useState<Template[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [body, setBody] = useState('')
  // The app's own confirmation, not `window.confirm`: these windows are
  // frameless and transparent, and a native dialog on top of one looks like it
  // belongs to a different program.
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = useCallback(async (select?: string) => {
    const list = await listTemplates()
    setTemplates(list)
    setActive((current) => {
      const wanted = select ?? current
      const found = list.find((entry) => entry.name === wanted) ?? list[0]
      setBody(found?.body ?? '')
      return found?.name ?? null
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function select(template: Template) {
    setActive(template.name)
    setBody(template.body)
  }

  async function save() {
    if (!active) return
    await writeTemplate(active, body)
    await refresh(active)
  }

  async function create() {
    // Numbered until it is free, so repeated clicks do not overwrite each other.
    let name = text.newName
    for (let index = 2; templates.some((entry) => entry.name === name); index += 1) {
      name = `${text.newName} ${index}`
    }

    await writeTemplate(name, '')
    await refresh(name)
  }

  async function remove(name: string) {
    setConfirming(null)
    await deleteTemplate(name)
    await refresh()
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>
      <p className="settings-hint">{text.variables}</p>

      <div className="template-layout">
        <div className="template-list">
          {templates.map((template) => (
            <button
              key={template.name}
              type="button"
              className={template.name === active ? 'template-item active' : 'template-item'}
              onClick={() => select(template)}
            >
              {template.name}
            </button>
          ))}
        </div>

        <div className="template-editor">
          {active ? (
            <NoteEditor
              key={active}
              value={body}
              onChange={setBody}
              onSave={() => void save()}
              toolbarExtra={
                <>
                  <button
                    type="button"
                    className="format-button"
                    title={text.create}
                    onClick={() => void create()}
                  >
                    <FilePlus2 size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="format-button"
                    title={text.remove}
                    // The blank template is what "new note" falls back to; a
                    // notebook with no blank template has no plain new note.
                    disabled={isBlankTemplate(active)}
                    onClick={() => setConfirming(active)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="format-button"
                    title={text.openFolder}
                    onClick={() => void templatesDirectory().then((dir) => openInExplorer(dir, false))}
                  >
                    <FolderOpen size={14} aria-hidden="true" />
                  </button>
                </>
              }
            />
          ) : (
            <p className="settings-hint">{text.empty}</p>
          )}
        </div>
      </div>

      {confirming && (
        <div className="editor-backdrop" onMouseDown={() => setConfirming(null)}>
          <div className="editor-card confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <span>{text.remove}</span>
            </div>
            <p>{text.confirmRemove(confirming)}</p>
            <div className="editor-footer">
              <div className="toolbar-spacer" />
              <button type="button" className="reminder-button" onClick={() => setConfirming(null)}>
                {strings.common.cancel}
              </button>
              <button
                type="button"
                className="reminder-button primary"
                onClick={() => void remove(confirming)}
              >
                {strings.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default TemplateSettings
