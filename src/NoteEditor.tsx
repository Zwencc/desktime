import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
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

const text = {
  bold: '加粗',
  italic: '斜体',
  heading: '标题',
  bullet: '无序列表',
  checklist: '待办项',
  preview: '预览',
  edit: '编辑',
  chars: '字',
}

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

// Insert a pasted image as an inline base64 data URI so it travels with the note.
function insertPastedImage(view: EditorView, file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    const url = typeof reader.result === 'string' ? reader.result : ''
    if (!url) return
    const snippet = `\n![image](${url})\n`
    const pos = view.state.selection.main.head
    view.dispatch({
      changes: { from: pos, insert: snippet },
      selection: { anchor: pos + snippet.length },
      userEvent: 'input',
    })
  }
  reader.readAsDataURL(file)
}

type NoteEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
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
  onSave,
  toolbarLead,
  toolbarExtra,
  footerExtra,
}: NoteEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const saveRef = useRef(onSave)
  // Captured once for the initial editor state; live updates flow through props.
  const initialDocRef = useRef(value)
  const placeholderRef = useRef(placeholder ?? '')

  const [charCount, setCharCount] = useState(value.length)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  onChangeRef.current = onChange
  saveRef.current = onSave

  // Create the editor once; React state stays the persistence source of truth.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialDocRef.current,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownHighlight),
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
              if (!image) return false
              event.preventDefault()
              insertPastedImage(target, image)
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

  // Reconcile external changes (switching notes, clearing, cross-window sync).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
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
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
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
