import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  keymap,
  placeholder as cmPlaceholder,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { Bold, Eye, Heading1, Italic, List, ListTodo, PenLine } from 'lucide-react'
import { renderMarkdown } from './markdown'
import { imagePreviews } from './noteImages'
import { emptyAssets, type AssetUrls } from './noteAssets'
import { useLocale } from './locales'


// Markdown syntax colours tuned for DeskTime's light glass panel.
const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '800', color: '#1e3a8a' },
  { tag: t.strong, fontWeight: '800', color: '#0f172a' },
  { tag: t.emphasis, fontStyle: 'italic', color: '#1e293b' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#94a3b8' },
  {
    tag: t.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#0369a1',
  },
  { tag: [t.link, t.url], color: '#2563eb', textDecoration: 'underline' },
  { tag: t.list, color: '#2563eb' },
  { tag: t.quote, color: '#64748b', fontStyle: 'italic' },
  { tag: t.contentSeparator, color: '#93c5fd' },
  { tag: t.processingInstruction, color: '#60a5fa' },
])

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '14px',
      color: '#1e293b',
      backgroundColor: 'transparent',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      lineHeight: '1.55',
      overflow: 'auto',
      padding: '2px 0',
    },
    '.cm-content': { padding: '2px 0', caretColor: '#1d4ed8' },
    '.cm-line': { padding: '0 2px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#1d4ed8' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
    },
    '.cm-placeholder': { color: 'rgba(30, 58, 138, 0.45)' },
    '.cm-scroller::-webkit-scrollbar': { width: '7px' },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'rgba(96, 165, 250, 0.42)',
      borderRadius: '999px',
    },
  },
  { dark: false },
)

function wrapSelection(view: EditorView, marker: string) {
  const changes = view.state.changeByRange((range) => {
    const selected = view.state.sliceDoc(range.from, range.to)
    const insert = `${marker}${selected}${marker}`
    const anchor = range.from + marker.length
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(anchor, anchor + selected.length),
    }
  })
  view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
  view.focus()
}

function prefixLines(view: EditorView, prefix: string) {
  const { state } = view
  const { from, to } = state.selection.main
  const firstLine = state.doc.lineAt(from).number
  const lastLine = state.doc.lineAt(to).number
  const changes = []
  for (let line = firstLine; line <= lastLine; line += 1) {
    changes.push({ from: state.doc.line(line).from, insert: prefix })
  }
  view.dispatch(state.update({ changes, userEvent: 'input' }))
  view.focus()
}

/**
 * Saves a pasted image and links to it.
 *
 * It used to be inlined as a base64 data URI, which meant a 2 MB screenshot
 * became 2.7 MB of markdown *text* that this editor then had to handle as one
 * very long line. The note now holds the picture as its own entry in the
 * container and the text holds a one-line reference to it.
 *
 * The link lands where the caret was when the paste happened, not where it is
 * when the write finishes: writing goes to disk and back, and the user may well
 * have carried on typing.
 */
function insertPastedImage(view: EditorView, file: File, save: ImageSaver) {
  const at = view.state.selection.main.head

  void (async () => {
    const reference = await save(file)
    if (!reference) return

    // The document may be shorter than it was — switching note while the write
    // was in flight replaces it wholesale — and dispatching past the end throws.
    const from = Math.min(at, view.state.doc.length)
    const snippet = `\n![${file.name}](${reference})\n`
    view.dispatch({
      changes: { from, insert: snippet },
      selection: { anchor: from + snippet.length },
      userEvent: 'input',
    })
  })()
}

/**
 * Takes an image into the open note and answers with the path to link to, or
 * null when it could not be taken. Supplied by whoever owns the note, because
 * only they know which pictures it already holds.
 */
export type ImageSaver = (file: File) => Promise<string | null>

type NoteEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** The open note's pictures, for showing them in place of their markdown. */
  assets?: AssetUrls
  /** Omitted where there is nowhere to put an image; pasting one then does nothing. */
  onSaveImage?: ImageSaver
  /** Ctrl+S. File actions and save status live in the notebook shell. */
  onSave: () => void
  toolbarLead?: ReactNode
  toolbarExtra?: ReactNode
  footerExtra?: ReactNode
}

export function NoteEditor({
  value,
  onChange,
  placeholder,
  assets = emptyAssets,
  onSaveImage,
  onSave,
  toolbarLead,
  toolbarExtra,
  footerExtra,
}: NoteEditorProps) {
  const text = useLocale().editor
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const saveRef = useRef(onSave)
  // Through a ref: the editor is built once, and this prop changes every time
  // the user switches note.
  const saveImageRef = useRef(onSaveImage)
  // Captured once for the initial editor state; live updates flow through props.
  const initialDocRef = useRef(value)
  const placeholderRef = useRef(placeholder ?? '')
  // Inline image previews have to be rebuilt when the note's pictures change,
  // and the editor itself is built once — so they go in a compartment, which is
  // CodeMirror's way of swapping one extension without touching the rest of the
  // configuration. The map is captured for the initial state the same way the
  // document is, and every later value arrives through the effect.
  const imagesRef = useRef(new Compartment())
  const initialAssetsRef = useRef(assets)
  // The undo stack goes in a compartment for one reason: replacing it is the
  // only way to throw it away, and it has to be thrown away when the document
  // is replaced from outside.
  const historyRef = useRef(new Compartment())

  const [charCount, setCharCount] = useState(value.length)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  onChangeRef.current = onChange
  saveRef.current = onSave
  saveImageRef.current = onSaveImage

  // Create the editor once; React state stays the persistence source of truth.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialDocRef.current,
        extensions: [
          historyRef.current.of(history()),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownHighlight),
          imagesRef.current.of(imagePreviews(initialAssetsRef.current)),
          editorTheme,
          cmPlaceholder(placeholderRef.current),
          keymap.of([
            { key: 'Mod-b', run: (target) => (wrapSelection(target, '**'), true) },
            { key: 'Mod-i', run: (target) => (wrapSelection(target, '*'), true) },
            { key: 'Mod-s', run: () => (saveRef.current(), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.domEventHandlers({
            paste(event, target) {
              const files = event.clipboardData?.files
              const image = files && Array.from(files).find((file) => file.type.startsWith('image/'))
              const save = saveImageRef.current
              if (!image || !save) return false
              event.preventDefault()
              insertPastedImage(target, image, save)
              return true
            },
            // Dropping an image is the same operation with a different gesture.
            // The window-level guard in NotebookPanel keeps unclaimed drops from
            // navigating the webview; this claims the ones aimed at the editor.
            drop(event, target) {
              const files = event.dataTransfer?.files
              const image = files && Array.from(files).find((file) => file.type.startsWith('image/'))
              const save = saveImageRef.current
              if (!image || !save) return false
              event.preventDefault()
              insertPastedImage(target, image, save)
              return true
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            onChangeRef.current(update.state.doc.toString())
            setCharCount(update.state.doc.length)
          }),
        ],
      }),
      parent: host,
    })

    viewRef.current = view
    setCharCount(view.state.doc.length)

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // A new note, or one more picture in this one: either way the decorations
  // have to be rebuilt against the map they resolve through.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: imagesRef.current.reconfigure(imagePreviews(assets)),
    })
  }, [assets])

  // Reconcile external changes (switching notes, clearing, cross-window sync).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    // The undo stack belonged to the note that was just replaced. Left alone,
    // one Ctrl+Z pulls the previous note's text back into this one — and when
    // the previous note was a private one that has just been locked away, that
    // undoes the locking too.
    view.dispatch({ effects: historyRef.current.reconfigure(history()) })
    setCharCount(value.length)
  }, [value])

  return (
    <div className="note-editor" data-no-drag>
      <div className="note-toolbar">
        {toolbarLead}
        {mode === 'edit' && (
          <>
            <button
              type="button"
              className="format-button"
              title={text.bold}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => viewRef.current && wrapSelection(viewRef.current, '**')}
            >
              <Bold size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="format-button"
              title={text.italic}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => viewRef.current && wrapSelection(viewRef.current, '*')}
            >
              <Italic size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="format-button"
              title={text.heading}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => viewRef.current && prefixLines(viewRef.current, '# ')}
            >
              <Heading1 size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="format-button"
              title={text.bullet}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => viewRef.current && prefixLines(viewRef.current, '- ')}
            >
              <List size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="format-button"
              title={text.checklist}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => viewRef.current && prefixLines(viewRef.current, '- [ ] ')}
            >
              <ListTodo size={15} aria-hidden="true" />
            </button>
          </>
        )}

        <div className="toolbar-spacer" />

        <button
          type="button"
          className={mode === 'preview' ? 'format-button active' : 'format-button'}
          title={mode === 'preview' ? text.edit : text.preview}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMode((current) => (current === 'preview' ? 'edit' : 'preview'))}
        >
          {mode === 'preview' ? <PenLine size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        </button>
        {toolbarExtra}
      </div>

      <div
        className="note-surface"
        ref={hostRef}
        style={mode === 'preview' ? { display: 'none' } : undefined}
      />
      {mode === 'preview' && (
        <div
          className="note-preview"
          // Sanitized in renderMarkdown (DOMPurify); only inline base64 images pass through.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value, assets) }}
        />
      )}

      <div className="note-footer">
        <span>
          {charCount} {text.chars}
        </span>
        {footerExtra}
      </div>
    </div>
  )
}

export default NoteEditor
