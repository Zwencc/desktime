// The notebook's file tree.
//
// Two regions with different rules: a pinned drafts area for notes that have no
// home on disk yet, and the virtual folder tree of saved files below it. Only
// the tree takes part in drag-and-drop, and dragging only ever rearranges the
// app's own view — the folders do not exist on disk.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Search,
} from 'lucide-react'
import {
  type NodeId,
  type NotebookTree,
  type TreeNode,
  childrenOf,
  isDescendant,
} from './notebook'

const text = {
  search: '搜索',
  newFile: '新建文件',
  newFolder: '新建文件夹',
  drafts: '草稿',
  rename: '重命名',
  delete: '删除',
  reveal: '在资源管理器中显示',
  missing: '文件已丢失',
  unsaved: '未保存',
  empty: '还没有已保存的文件',
  webOnly: '文件保存仅桌面版可用',
}

type DropMode = 'before' | 'after' | 'into'

type DropTarget = { id: NodeId | null; mode: DropMode }

/** Share of a row's height that means "insert above/below" rather than "into". */
const EDGE_ZONE = 0.3

type NotebookSidebarProps = {
  tree: NotebookTree
  activeId: NodeId | null
  dirtyIds: Set<NodeId>
  expanded: NodeId[]
  canUseFiles: boolean
  onSelect: (id: NodeId) => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onRename: (id: NodeId, name: string) => void
  onDelete: (id: NodeId) => void
  onMove: (nodeId: NodeId, parentId: NodeId | null, beforeId: NodeId | null) => void
  onReveal: (id: NodeId) => void
  onToggleExpanded: (id: NodeId) => void
}

export function NotebookSidebar({
  tree,
  activeId,
  dirtyIds,
  expanded,
  canUseFiles,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onMove,
  onReveal,
  onToggleExpanded,
}: NotebookSidebarProps) {
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<{ id: NodeId; value: string } | null>(null)
  const [menu, setMenu] = useState<{ id: NodeId; x: number; y: number } | null>(null)
  const [dragId, setDragId] = useState<NodeId | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<NodeId | null>(null)

  useEffect(() => {
    renameRef.current?.select()
  }, [renaming?.id])

  useEffect(() => {
    if (!menu) return
    function close() {
      setMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  function commitRename() {
    if (!renaming) return
    const value = renaming.value.trim()
    setRenaming(null)
    if (value) onRename(renaming.id, value)
  }

  function openMenu(event: MouseEvent<HTMLElement>, id: NodeId) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ id, x: event.clientX, y: event.clientY })
  }

  // The menu is portalled to <body> so the sidebar's `overflow: hidden` cannot
  // clip it, then pulled back inside the window when the cursor was near an edge.
  useLayoutEffect(() => {
    const host = menuRef.current
    if (!menu || !host) return

    const { width, height } = host.getBoundingClientRect()
    const x = Math.max(4, Math.min(menu.x, window.innerWidth - width - 4))
    const y = Math.max(4, Math.min(menu.y, window.innerHeight - height - 4))
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y })
  }, [menu])

  function startDrag(event: DragEvent<HTMLElement>, id: NodeId) {
    // Tracked in a ref as well as in state: `dragover` starts firing before
    // React commits the state update, and a `dragover` that does not call
    // preventDefault() leaves the pointer showing "no drop".
    dragIdRef.current = id
    setDragId(id)
    event.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag without payload; the id itself is enough.
    event.dataTransfer.setData('text/plain', id)
  }

  function endDrag() {
    dragIdRef.current = null
    setDragId(null)
    setDropTarget(null)
  }

  function nodeOf(id: NodeId | null) {
    if (!id) return undefined
    return (
      tree.folders.find((folder) => folder.id === id) ??
      tree.files.find((file) => file.id === id)
    )
  }

  /** Where a drop would land, from the cursor's position within the row. */
  function modeFor(event: DragEvent<HTMLElement>, isFolder: boolean): DropMode {
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = (event.clientY - rect.top) / (rect.height || 1)
    if (offset < EDGE_ZONE) return 'before'
    if (offset > 1 - EDGE_ZONE) return 'after'
    // Only folders can be dropped *into*; a file's middle behaves like its top.
    return isFolder ? 'into' : 'before'
  }

  function canDrop(target: DropTarget) {
    const moving = dragIdRef.current
    if (!moving || target.id === moving) return false
    // A folder cannot be filed inside itself or its own descendants — that would
    // detach the branch from the root.
    return !(target.id && isDescendant(tree, target.id, moving))
  }

  function allowDrop(event: DragEvent<HTMLElement>, target: DropTarget) {
    if (!canDrop(target)) return

    // Rows sit inside the tree's own root drop zone, so without this the root
    // handler would immediately overwrite the row as the current target.
    event.stopPropagation()
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  function finishDrop(event: DragEvent<HTMLElement>, target: DropTarget) {
    event.preventDefault()
    event.stopPropagation()

    const moving = dragIdRef.current
    const allowed = canDrop(target)
    endDrag()
    if (!moving || !allowed) return

    if (target.mode === 'into') {
      onMove(moving, target.id, null)
      return
    }

    const sibling = nodeOf(target.id)
    if (!sibling) return

    if (target.mode === 'before') {
      onMove(moving, sibling.parentId, sibling.id)
      return
    }

    // "after" is expressed as "before the next sibling", or append when last.
    const siblings = childrenOf(tree, sibling.parentId).filter((node) => node.id !== moving)
    const next = siblings[siblings.findIndex((node) => node.id === sibling.id) + 1]
    onMove(moving, sibling.parentId, next ? next.id : null)
  }

  function renderRow(node: TreeNode, depth: number) {
    const isFolder = node.kind === 'folder'
    const isOpen = expanded.includes(node.id)
    const classes = ['tree-row']
    if (node.id === activeId) classes.push('active')
    if (node.id === dragId) classes.push('dragging')
    if (dropTarget?.id === node.id) classes.push(`drop-${dropTarget.mode}`)
    if (node.kind === 'file' && node.missing) classes.push('missing')

    return (
      <div key={node.id}>
        <div
          className={classes.join(' ')}
          style={{ paddingLeft: 6 + depth * 12 }}
          draggable={renaming?.id !== node.id}
          onDragStart={(event) => startDrag(event, node.id)}
          onDragEnd={endDrag}
          onDragOver={(event) => allowDrop(event, { id: node.id, mode: modeFor(event, isFolder) })}
          onDragLeave={(event) => {
            // `dragleave` also fires when the pointer moves onto a child span,
            // so only clear once it has really left the row.
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setDropTarget((current) => (current?.id === node.id ? null : current))
          }}
          onDrop={(event) => finishDrop(event, { id: node.id, mode: modeFor(event, isFolder) })}
          onClick={() => (isFolder ? onToggleExpanded(node.id) : onSelect(node.id))}
          onDoubleClick={() => setRenaming({ id: node.id, value: node.name })}
          onContextMenu={(event) => openMenu(event, node.id)}
        >
          <span className="tree-icon">
            {isFolder ? (
              isOpen ? (
                <ChevronDown size={12} aria-hidden="true" />
              ) : (
                <ChevronRight size={12} aria-hidden="true" />
              )
            ) : null}
          </span>
          <span className="tree-icon">
            {isFolder ? (
              isOpen ? (
                <FolderOpen size={13} aria-hidden="true" />
              ) : (
                <Folder size={13} aria-hidden="true" />
              )
            ) : (
              <FileText size={13} aria-hidden="true" />
            )}
          </span>

          {renaming?.id === node.id ? (
            <input
              ref={renameRef}
              className="tree-rename"
              value={renaming.value}
              onChange={(event) => setRenaming({ id: node.id, value: event.target.value })}
              onBlur={commitRename}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') setRenaming(null)
              }}
              autoFocus
            />
          ) : (
            <span className="tree-name">{node.name}</span>
          )}

          {node.kind === 'file' && node.missing && (
            <AlertTriangle size={12} aria-hidden="true" className="tree-warn" />
          )}
          {dirtyIds.has(node.id) && <span className="tree-dot" title={text.unsaved} />}
        </div>

        {isFolder &&
          isOpen &&
          childrenOf(tree, node.id).map((child) => renderRow(child, depth + 1))}
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  const roots = childrenOf(tree, null)
  const matches = needle
    ? [...tree.folders, ...tree.files].filter((node) =>
        node.name.toLowerCase().includes(needle),
      )
    : null
  const drafts = [...tree.drafts]
    .filter((draft) => !needle || draft.name.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="notebook-sidebar" data-own-context data-no-drag>
      <div className="sidebar-tools">
        <label className="sidebar-search">
          <Search size={12} aria-hidden="true" />
          <input
            value={query}
            placeholder={text.search}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="icon-button" type="button" title={text.newFile} onClick={onCreateFile}>
          <FilePlus size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={text.newFolder}
          onClick={onCreateFolder}
        >
          <FolderPlus size={14} aria-hidden="true" />
        </button>
      </div>

      {drafts.length > 0 && (
        <div className="sidebar-group">
          <div className="sidebar-head">
            {text.drafts} ({drafts.length})
          </div>
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className={draft.id === activeId ? 'tree-row draft active' : 'tree-row draft'}
              onClick={() => onSelect(draft.id)}
              onDoubleClick={() => setRenaming({ id: draft.id, value: draft.name })}
              onContextMenu={(event) => openMenu(event, draft.id)}
            >
              <span className="tree-icon" />
              <span className="tree-icon">
                <FileText size={13} aria-hidden="true" />
              </span>
              {renaming?.id === draft.id ? (
                <input
                  ref={renameRef}
                  className="tree-rename"
                  value={renaming.value}
                  onChange={(event) => setRenaming({ id: draft.id, value: event.target.value })}
                  onBlur={commitRename}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename()
                    if (event.key === 'Escape') setRenaming(null)
                  }}
                  autoFocus
                />
              ) : (
                <span className="tree-name">{draft.name}</span>
              )}
              <span className="tree-dot" title={text.unsaved} />
            </div>
          ))}
        </div>
      )}

      {/* The blank area is the drop zone that files a node back at the root. */}
      <div
        className={dropTarget?.id === null ? 'sidebar-tree drop-root' : 'sidebar-tree'}
        onDragOver={(event) => allowDrop(event, { id: null, mode: 'into' })}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDropTarget(null)
        }}
        onDrop={(event) => finishDrop(event, { id: null, mode: 'into' })}
      >
        {matches
          ? matches.map((node) => renderRow(node, 0))
          : roots.map((node) => renderRow(node, 0))}
        {roots.length === 0 && !matches && (
          <p className="sidebar-empty">{canUseFiles ? text.empty : text.webOnly}</p>
        )}
      </div>

      {menu &&
        createPortal(
        <div ref={menuRef} className="sidebar-menu" style={{ left: menu.x, top: menu.y }}>
          <button
            type="button"
            onClick={() => {
              const node = tree.folders.find((entry) => entry.id === menu.id)
                ?? tree.files.find((entry) => entry.id === menu.id)
                ?? tree.drafts.find((entry) => entry.id === menu.id)
              if (node) setRenaming({ id: node.id, value: node.name })
              setMenu(null)
            }}
          >
            {text.rename}
          </button>
          {tree.files.some((file) => file.id === menu.id) && (
            <button
              type="button"
              onClick={() => {
                onReveal(menu.id)
                setMenu(null)
              }}
            >
              {text.reveal}
            </button>
          )}
          <button
            type="button"
            className="danger"
            onClick={() => {
              onDelete(menu.id)
              setMenu(null)
            }}
          >
            {text.delete}
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default NotebookSidebar
