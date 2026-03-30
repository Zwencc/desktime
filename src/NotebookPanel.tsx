// The notebook shell: file tree on the left, editor on the right, and all the
// save orchestration in between.
//
// The rule that shapes everything here: a note is *always* being saved. Drafts
// auto-save to their temp file, mapped notes auto-save back to their own path,
// and neither ever opens a dialog. The save dialog appears in exactly two
// places — giving a draft its first home, and "save as".

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window'
import { FilePlus2, FolderOpen, PanelLeft, Save } from 'lucide-react'
import { isTauri } from './env'
import { NoteEditor } from './NoteEditor'
import { NotebookSidebar } from './NotebookSidebar'
import {
  type DraftNode,
  type FileNode,
  type FolderNode,
  type NodeId,
  type NotebookTree,
  type SidebarState,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  collectSubtree,
  deleteDraftFile,
  fileNameOf,
  findNode,
  joinPath,
  migrateLegacyNote,
  moveNode,
  moveToRecycleBin,
  nextDraftName,
  nextOrder,
  openInExplorer,
  parentDirOf,
  pickOpenPath,
  pickSavePath,
  readActiveId,
  readDraft,
  readFile,
  readSidebar,
  readTree,
  renamePath,
  saveActiveId,
  saveSidebar,
  saveTree,
  withExtension,
  writeDraft,
  writeFile,
} from './notebook'
import { readSettings, subscribeSettings } from './settings'
import { formatHm } from './time'

const text = {
  placeholder: '随手记点什么...',
  toggleSidebar: '文件列表',
  save: '保存',
  saveAs: '另存为',
  openFile: '打开已有文件',
  newFolderName: '新建文件夹',
  unsaved: '未保存',
  saving: '保存中…',
  saved: (at: string) => `已保存 ${at}`,
  draft: '草稿 · 未落盘',
  saveFailed: '保存失败，已存入本地备份',
  renameFailed: (reason: string) => `重命名失败：${reason}`,
  deleteFailed: (reason: string) => `删除失败：${reason}`,
  empty: '左侧新建或打开一个文件',
  cancel: '取消',
  confirmDelete: '删除',
  deleteFileTitle: '删除文件',
  deleteFileBody: (name: string) => `「${name}」将被删除到 Windows 回收站（可恢复）。`,
  deleteFolderTitle: '删除文件夹',
  deleteFolderEmpty: (name: string) => `「${name}」是空文件夹，将被移除。`,
  deleteFolderBody: (name: string, count: number) =>
    `「${name}」内含 ${count} 个文件，将一并删除到 Windows 回收站（可恢复）：`,
  andMore: (count: number) => `等 ${count} 个文件`,
  deleteDraftTitle: '删除草稿',
  deleteDraftBody: (name: string) => `「${name}」尚未保存到磁盘，删除后内容将不可恢复。`,
  deleteAnyway: '直接删除',
}

/** Editor width to protect when the sidebar is opened on a narrow window. */
const EDITOR_MIN_WIDTH = 260

/** Files listed by name in the folder-delete confirmation before collapsing. */
const NAMED_FILES = 5

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; message: string }

type Confirm =
  | { kind: 'file'; id: NodeId; name: string }
  | { kind: 'draft'; id: NodeId; name: string }
  | { kind: 'folder'; id: NodeId; name: string; files: FileNode[] }

export function NotebookPanel() {
  const [tree, setTree] = useState<NotebookTree>(readTree)
  const [activeId, setActiveId] = useState<NodeId | null>(readActiveId)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })
  const [sidebar, setSidebar] = useState<SidebarState>(readSidebar)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [autoSaveSeconds, setAutoSaveSeconds] = useState(() => readSettings().autoSaveSeconds)

  // Flush handlers fire outside React's render flow (blur, window close), so the
  // live values have to be reachable without going through a stale closure.
  const treeRef = useRef(tree)
  const contentRef = useRef(content)
  const dirtyRef = useRef(dirty)
  const activeIdRef = useRef(activeId)

  treeRef.current = tree
  contentRef.current = content
  dirtyRef.current = dirty
  activeIdRef.current = activeId

  const activeNode = activeId ? findNode(tree, activeId) : undefined

  useEffect(() => {
    saveTree(tree)
  }, [tree])

  useEffect(() => subscribeSettings((next) => setAutoSaveSeconds(next.autoSaveSeconds)), [])

  useEffect(() => {
    saveSidebar(sidebar)
  }, [sidebar])

  const persist = useCallback(async (id: NodeId, body: string) => {
    const node = findNode(treeRef.current, id)
    if (!node) return

    setStatus({ kind: 'saving' })
    try {
      if (node.kind === 'draft') {
        await writeDraft(id, body)
      } else if (node.kind === 'file') {
        await writeFile(node.path, body)
        setTree((current) => ({
          ...current,
          files: current.files.map((file) =>
            file.id === id ? { ...file, lastSavedAt: Date.now(), missing: false } : file,
          ),
        }))
      }

      setDirty(false)
      setStatus({ kind: 'saved', at: formatHm(new Date()) })
    } catch {
      // The target may be locked, on a removed drive, or read-only. Park the text
      // in a backup draft rather than letting the edit evaporate.
      try {
        await writeDraft(`${id}-backup`, body)
      } catch {
        // Nothing left to try; the error status below is the honest report.
      }
      setStatus({ kind: 'error', message: text.saveFailed })
    }
  }, [])

  const flush = useCallback(() => {
    const id = activeIdRef.current
    if (!id || !dirtyRef.current) return
    void persist(id, contentRef.current)
  }, [persist])

  // Idle auto-save. Applies to drafts and mapped files alike — the whole point
  // is that nothing has to be saved by hand to be safe.
  useEffect(() => {
    if (!dirty || !activeId) return

    const timer = window.setTimeout(() => {
      void persist(activeId, contentRef.current)
    }, autoSaveSeconds * 1000)

    return () => window.clearTimeout(timer)
  }, [dirty, content, activeId, autoSaveSeconds, persist])

  // This window runs with Tauri's native drag-drop turned off, which is what
  // lets the sidebar use HTML5 drag and drop at all on Windows. The trade-off is
  // that an unclaimed drop would let the webview navigate to the dropped file,
  // so anything the tree or the editor did not handle is swallowed here.
  useEffect(() => {
    function swallow(event: globalThis.DragEvent) {
      if (event.defaultPrevented) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    }

    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    window.addEventListener('blur', flush)
    if (isTauri) {
      void getCurrentWindow()
        .onCloseRequested(() => flush())
        .then((stop) => {
          unlisten = stop
        })
    }

    return () => {
      window.removeEventListener('blur', flush)
      unlisten?.()
    }
  }, [flush])

  const loadNode = useCallback(async (id: NodeId | null) => {
    const node = id ? findNode(treeRef.current, id) : undefined
    if (!node || node.kind === 'folder') {
      setContent('')
      setDirty(false)
      return
    }

    if (node.kind === 'draft') {
      setContent(await readDraft(node.id))
      setDirty(false)
      setStatus({ kind: 'idle' })
      return
    }

    try {
      setContent(await readFile(node.path))
      setTree((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === node.id ? { ...file, missing: false } : file,
        ),
      }))
      setStatus({ kind: 'idle' })
    } catch {
      setContent('')
      setTree((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === node.id ? { ...file, missing: true } : file,
        ),
      }))
    }
    setDirty(false)
  }, [])

  // Migrate the single pre-notebook note, then open whatever was last active.
  useEffect(() => {
    void (async () => {
      const migrated = await migrateLegacyNote(readTree())
      setTree(migrated)
      treeRef.current = migrated

      const restored = readActiveId()
      const exists = restored ? findNode(migrated, restored) : undefined
      const target = exists && exists.kind !== 'folder' ? restored : null
      setActiveId(target)
      await loadNode(target)
    })()
  }, [loadNode])

  async function selectNode(id: NodeId) {
    if (id === activeId) return

    // Switching always saves first — that is why there is no prompt.
    if (activeIdRef.current && dirtyRef.current) {
      await persist(activeIdRef.current, contentRef.current)
    }

    setActiveId(id)
    saveActiveId(id)
    await loadNode(id)
  }

  function createFile() {
    void (async () => {
      if (activeIdRef.current && dirtyRef.current) {
        await persist(activeIdRef.current, contentRef.current)
      }

      const draft: DraftNode = {
        id: crypto.randomUUID(),
        kind: 'draft',
        name: nextDraftName(treeRef.current.drafts),
        updatedAt: Date.now(),
      }

      // Written straight away so the draft exists on disk from the first keystroke.
      await writeDraft(draft.id, '')
      setTree((current) => ({ ...current, drafts: [...current.drafts, draft] }))
      setActiveId(draft.id)
      saveActiveId(draft.id)
      setContent('')
      setDirty(false)
      setStatus({ kind: 'idle' })
    })()
  }

  function createFolder() {
    const folder: FolderNode = {
      id: crypto.randomUUID(),
      kind: 'folder',
      name: text.newFolderName,
      parentId: null,
      order: nextOrder(tree, null),
    }
    setTree((current) => ({ ...current, folders: [...current.folders, folder] }))
  }

  function openExisting() {
    void (async () => {
      const path = await pickOpenPath()
      if (!path) return

      const existing = treeRef.current.files.find((file) => file.path === path)
      if (existing) {
        await selectNode(existing.id)
        return
      }

      const file: FileNode = {
        id: crypto.randomUUID(),
        kind: 'file',
        name: fileNameOf(path),
        parentId: null,
        order: nextOrder(treeRef.current, null),
        path,
        lastSavedAt: Date.now(),
      }

      if (activeIdRef.current && dirtyRef.current) {
        await persist(activeIdRef.current, contentRef.current)
      }

      const next = { ...treeRef.current, files: [...treeRef.current.files, file] }
      setTree(next)
      treeRef.current = next
      setActiveId(file.id)
      saveActiveId(file.id)
      await loadNode(file.id)
    })()
  }

  /** Turns a draft into a mapped file at a location the user picks. */
  async function promoteDraft(draft: DraftNode) {
    const path = await pickSavePath(`${draft.name}.md`)
    if (!path) return false

    setStatus({ kind: 'saving' })
    try {
      await writeFile(path, contentRef.current)
    } catch {
      setStatus({ kind: 'error', message: text.saveFailed })
      return false
    }

    await deleteDraftFile(draft.id)
    setTree((current) => ({
      ...current,
      drafts: current.drafts.filter((entry) => entry.id !== draft.id),
      files: [
        ...current.files,
        {
          // Keeping the id means the open note stays open through the promotion.
          id: draft.id,
          kind: 'file',
          name: fileNameOf(path),
          parentId: null,
          order: nextOrder(current, null),
          path,
          lastSavedAt: Date.now(),
        },
      ],
    }))
    setDirty(false)
    setStatus({ kind: 'saved', at: formatHm(new Date()) })
    return true
  }

  function manualSave() {
    if (!activeNode) return
    if (activeNode.kind === 'draft') {
      void promoteDraft(activeNode)
      return
    }
    if (activeNode.kind === 'file') void persist(activeNode.id, contentRef.current)
  }

  function saveAs() {
    if (!activeNode || activeNode.kind === 'folder') return

    void (async () => {
      const suggested = activeNode.kind === 'file' ? activeNode.name : `${activeNode.name}.md`
      const path = await pickSavePath(suggested)
      if (!path) return

      setStatus({ kind: 'saving' })
      try {
        await writeFile(path, contentRef.current)
      } catch {
        setStatus({ kind: 'error', message: text.saveFailed })
        return
      }

      if (activeNode.kind === 'draft') {
        await deleteDraftFile(activeNode.id)
        setTree((current) => ({
          ...current,
          drafts: current.drafts.filter((entry) => entry.id !== activeNode.id),
          files: [
            ...current.files,
            {
              id: activeNode.id,
              kind: 'file',
              name: fileNameOf(path),
              parentId: null,
              order: nextOrder(current, null),
              path,
              lastSavedAt: Date.now(),
            },
          ],
        }))
      } else {
        setTree((current) => ({
          ...current,
          files: current.files.map((file) =>
            file.id === activeNode.id
              ? { ...file, path, name: fileNameOf(path), lastSavedAt: Date.now(), missing: false }
              : file,
          ),
        }))
      }

      setDirty(false)
      setStatus({ kind: 'saved', at: formatHm(new Date()) })
    })()
  }

  function renameNode(id: NodeId, name: string) {
    const node = findNode(tree, id)
    if (!node) return

    if (node.kind === 'folder') {
      setTree((current) => ({
        ...current,
        folders: current.folders.map((folder) =>
          folder.id === id ? { ...folder, name } : folder,
        ),
      }))
      return
    }

    if (node.kind === 'draft') {
      setTree((current) => ({
        ...current,
        drafts: current.drafts.map((draft) => (draft.id === id ? { ...draft, name } : draft)),
      }))
      return
    }

    // Mapped notes rename on disk too, so the sidebar never lies about the file.
    const nextName = withExtension(name, node.name)
    if (nextName === node.name) return

    void (async () => {
      const nextPath = joinPath(parentDirOf(node.path), nextName)
      try {
        await renamePath(node.path, nextPath)
      } catch (error) {
        setStatus({ kind: 'error', message: text.renameFailed(String(error)) })
        return
      }

      setTree((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === id ? { ...file, name: nextName, path: nextPath } : file,
        ),
      }))
    })()
  }

  function requestDelete(id: NodeId) {
    const node = findNode(tree, id)
    if (!node) return

    if (node.kind === 'draft') {
      setConfirm({ kind: 'draft', id, name: node.name })
      return
    }
    if (node.kind === 'file') {
      setConfirm({ kind: 'file', id, name: node.name })
      return
    }
    setConfirm({ kind: 'folder', id, name: node.name, files: collectSubtree(tree, id).files })
  }

  function dropNodes(removed: Set<NodeId>) {
    setTree((current) => ({
      folders: current.folders.filter((folder) => !removed.has(folder.id)),
      files: current.files.filter((file) => !removed.has(file.id)),
      drafts: current.drafts.filter((draft) => !removed.has(draft.id)),
    }))

    if (activeIdRef.current && removed.has(activeIdRef.current)) {
      setActiveId(null)
      saveActiveId(null)
      setContent('')
      setDirty(false)
    }
  }

  async function runDelete(target: Confirm) {
    setConfirm(null)

    if (target.kind === 'draft') {
      await deleteDraftFile(target.id)
      dropNodes(new Set([target.id]))
      return
    }

    if (target.kind === 'file') {
      const file = tree.files.find((entry) => entry.id === target.id)
      if (!file) return
      try {
        await moveToRecycleBin(file.path)
      } catch (error) {
        setStatus({ kind: 'error', message: text.deleteFailed(String(error)) })
        return
      }
      dropNodes(new Set([target.id]))
      return
    }

    // Folders cascade. Stop at the first failure and remove only what actually
    // went to the recycle bin, so the tree never claims a file is gone when it
    // is still on disk.
    const { folders, files } = collectSubtree(tree, target.id)
    const removed = new Set<NodeId>()
    for (const file of files) {
      try {
        await moveToRecycleBin(file.path)
        removed.add(file.id)
      } catch (error) {
        dropNodes(removed)
        setStatus({ kind: 'error', message: text.deleteFailed(String(error)) })
        return
      }
    }

    folders.forEach((folder) => removed.add(folder.id))
    dropNodes(removed)
  }

  function toggleSidebar() {
    const next = !sidebar.open
    setSidebar((current) => ({ ...current, open: next }))
    if (!next || !isTauri) return

    // Opening the tree on a narrow window would squeeze the editor to nothing.
    void (async () => {
      const appWindow = getCurrentWindow()
      const size = await appWindow.innerSize()
      const scale = window.devicePixelRatio || 1
      const needed = Math.round((sidebar.width + EDITOR_MIN_WIDTH) * scale)
      if (size.width < needed) await appWindow.setSize(new PhysicalSize(needed, size.height))
    })()
  }

  function startSidebarResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebar.width

    function onMove(move: globalThis.MouseEvent) {
      const width = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + move.clientX - startX),
      )
      setSidebar((current) => ({ ...current, width }))
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const isDraft = activeNode?.kind === 'draft'
  const statusLabel =
    status.kind === 'saving'
      ? text.saving
      : status.kind === 'error'
        ? status.message
        : dirty
          ? text.unsaved
          : status.kind === 'saved'
            ? text.saved(status.at)
            : isDraft
              ? text.draft
              : ''

  return (
    <div className="notebook">
      {sidebar.open && (
        <>
          <div className="sidebar-host" style={{ width: sidebar.width }}>
            <NotebookSidebar
              tree={tree}
              activeId={activeId}
              dirtyIds={dirty && activeId ? new Set([activeId]) : new Set()}
              expanded={sidebar.expanded}
              canUseFiles={isTauri}
              onSelect={(id) => void selectNode(id)}
              onCreateFile={createFile}
              onCreateFolder={createFolder}
              onRename={renameNode}
              onDelete={requestDelete}
              onMove={(nodeId, parentId, beforeId) =>
                setTree((current) => moveNode(current, nodeId, parentId, beforeId))
              }
              onReveal={(id) => {
                const file = tree.files.find((entry) => entry.id === id)
                if (file) void openInExplorer(file.path, true)
              }}
              onToggleExpanded={(id) =>
                setSidebar((current) => ({
                  ...current,
                  expanded: current.expanded.includes(id)
                    ? current.expanded.filter((entry) => entry !== id)
                    : [...current.expanded, id],
                }))
              }
            />
          </div>
          <div className="sidebar-resizer" data-no-drag onMouseDown={startSidebarResize} />
        </>
      )}

      <div className="notebook-main">
        <NoteEditor
          value={content}
          onChange={(next) => {
            setContent(next)
            setDirty(true)
          }}
          placeholder={text.placeholder}
          onSave={manualSave}
          toolbarLead={
            <button
              type="button"
              className={sidebar.open ? 'format-button active' : 'format-button'}
              title={text.toggleSidebar}
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleSidebar}
            >
              <PanelLeft size={14} aria-hidden="true" />
            </button>
          }
          toolbarExtra={
            <>
              <button
                type="button"
                className="format-button"
                title={text.openFile}
                onMouseDown={(event) => event.preventDefault()}
                onClick={openExisting}
              >
                <FolderOpen size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="format-button"
                title={text.saveAs}
                onMouseDown={(event) => event.preventDefault()}
                onClick={saveAs}
              >
                <FilePlus2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="format-button save-note-button"
                title={text.save}
                disabled={status.kind === 'saving'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={manualSave}
              >
                <Save size={14} aria-hidden="true" />
              </button>
            </>
          }
          footerExtra={
            <span className={status.kind === 'error' ? 'note-status error' : 'note-status'}>
              {statusLabel}
            </span>
          }
        />
        {!activeNode && <p className="notebook-hint">{text.empty}</p>}
      </div>

      {confirm && (
        <div className="editor-backdrop" onMouseDown={() => setConfirm(null)}>
          <div className="editor-card confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <span>
                {confirm.kind === 'draft'
                  ? text.deleteDraftTitle
                  : confirm.kind === 'folder'
                    ? text.deleteFolderTitle
                    : text.deleteFileTitle}
              </span>
            </div>

            {confirm.kind === 'draft' && <p>{text.deleteDraftBody(confirm.name)}</p>}
            {confirm.kind === 'file' && <p>{text.deleteFileBody(confirm.name)}</p>}
            {confirm.kind === 'folder' && (
              <>
                <p>
                  {confirm.files.length === 0
                    ? text.deleteFolderEmpty(confirm.name)
                    : text.deleteFolderBody(confirm.name, confirm.files.length)}
                </p>
                {confirm.files.length > 0 && (
                  <ul className="confirm-list">
                    {confirm.files.slice(0, NAMED_FILES).map((file) => (
                      <li key={file.id}>{file.name}</li>
                    ))}
                    {confirm.files.length > NAMED_FILES && (
                      <li>{text.andMore(confirm.files.length - NAMED_FILES)}</li>
                    )}
                  </ul>
                )}
              </>
            )}

            <div className="editor-footer">
              <div className="toolbar-spacer" />
              <button type="button" className="reminder-button" onClick={() => setConfirm(null)}>
                {text.cancel}
              </button>
              {confirm.kind === 'draft' && (
                <button
                  type="button"
                  className="reminder-button primary"
                  onClick={() => {
                    const draft = tree.drafts.find((entry) => entry.id === confirm.id)
                    setConfirm(null)
                    // Saving here keeps the note: it is promoted to a real file
                    // and stays in the list, which is the point of offering it.
                    if (draft) void promoteDraft(draft)
                  }}
                >
                  {text.save}
                </button>
              )}
              <button
                type="button"
                className="reminder-button danger"
                onClick={() => void runDelete(confirm)}
              >
                {confirm.kind === 'draft' ? text.deleteAnyway : text.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotebookPanel
