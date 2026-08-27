// The notebook's file tree.
//
// Three regions with different rules: a pinned drafts area for notes that have
// no home on disk yet, the virtual folder tree of saved files below it, and the
// privacy vault below that. Only the file tree takes part in drag-and-drop, and
// dragging only ever rearranges the app's own view — the folders do not exist on
// disk.
//
// **While the vault is locked its region is a header and nothing else.** Not a
// greyed-out list, not a count, not a name: the file names are the private part
// ("resignation-plan" says the thing before it is opened), so a locked vault has
// nothing to show. Everything below comes from a `vault_list` that only exists
// while a session does, and it goes when the session does.

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
import { Lock, ShieldCheck } from 'lucide-react'
import type { VaultEntry } from './api/vault'
import { useLocale } from './locales'
import { type Template, listTemplates } from './templates'
import {
  type NodeId,
  type NotebookTree,
  type TreeNode,
  childrenOf,
  isDescendant,
} from './notebook'


/**
 * The privacy vault region, or `null` where there is no backend to hold one.
 *
 * `entries` is empty whenever `unlocked` is false, and that is not a convention
 * to remember — the frontend has no way to produce them without a session.
 */
export type VaultArea = {
  initialized: boolean
  unlocked: boolean
  entries: VaultEntry[]
  activeId: string | null
  expanded: string[]
  onOpen: () => void
  onLock: () => void
  onSelect: (entryId: string) => void
  onToggleExpanded: (entryId: string) => void
  onCreateNote: (parentId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRename: (entryId: string, name: string) => void
  onDelete: (entryId: string) => void
  /** The one way out, and the only way a private note becomes readable again. */
  onExport: (entryId: string) => void
  /** Moves a plain note or a whole folder of them in. */
  onImport: (nodeId: NodeId) => void
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
  onCreateFile: (template?: Template) => void
  /** New file inside this folder; asks for a path, because folders hold real files. */
  onCreateFileIn: (parentId: NodeId) => void
  onCreateFolder: () => void
  onRename: (id: NodeId, name: string) => void
  onDelete: (id: NodeId) => void
  onMove: (nodeId: NodeId, parentId: NodeId | null, beforeId: NodeId | null) => void
  onReveal: (id: NodeId) => void
  onToggleExpanded: (id: NodeId) => void
  vault: VaultArea | null
}

export function NotebookSidebar({
  tree,
  activeId,
  dirtyIds,
  expanded,
  canUseFiles,
  onSelect,
  onCreateFile,
  onCreateFileIn,
  onCreateFolder,
  onRename,
  onDelete,
  onMove,
  onReveal,
  onToggleExpanded,
  vault,
}: NotebookSidebarProps) {
  const strings = useLocale()
  const notebookText = strings.notebook
  const text = strings.sidebar
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<{ id: NodeId; value: string } | null>(null)
  const [menu, setMenu] = useState<{ id: NodeId; x: number; y: number } | null>(null)
  // Its own state rather than a variant of `menu`: this one hangs off a toolbar
  // button rather than a node, and shares nothing with it but the styling.
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  // The vault keeps its own rename and menu state. Its ids come from an
  // encrypted index rather than from the tree, and keeping the two apart is what
  // stops a menu action ever being routed at the wrong half of the sidebar.
  const [vaultRenaming, setVaultRenaming] = useState<{ id: string; value: string } | null>(null)
  const [vaultMenu, setVaultMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dragId, setDragId] = useState<NodeId | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<NodeId | null>(null)

  useEffect(() => {
    renameRef.current?.select()
  }, [renaming?.id])

  useEffect(() => {
    if (!menu && !templateMenu && !vaultMenu) return
    function close() {
      setMenu(null)
      setTemplateMenu(null)
      setVaultMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu, templateMenu, vaultMenu])

  function commitVaultRename() {
    if (!vaultRenaming) return
    const value = vaultRenaming.value.trim()
    setVaultRenaming(null)
    if (value) vault?.onRename(vaultRenaming.id, value)
  }

  function renderVaultRow(entry: VaultEntry, depth: number) {
    if (!vault) return null
    const isFolder = entry.kind === 'folder'
    const isOpen = vault.expanded.includes(entry.id)
    const classes = ['tree-row']
    if (entry.id === vault.activeId) classes.push('active')
    if (entry.kind === 'backup') classes.push('missing')

    return (
      <div key={entry.id}>
        <div
          className={classes.join(' ')}
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => (isFolder ? vault.onToggleExpanded(entry.id) : vault.onSelect(entry.id))}
          onDoubleClick={() => setVaultRenaming({ id: entry.id, value: entry.name })}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setVaultMenu({ id: entry.id, x: event.clientX, y: event.clientY })
          }}
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

          {vaultRenaming?.id === entry.id ? (
            <input
              className="tree-rename"
              value={vaultRenaming.value}
              onChange={(event) => setVaultRenaming({ id: entry.id, value: event.target.value })}
              onBlur={commitVaultRename}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitVaultRename()
                if (event.key === 'Escape') setVaultRenaming(null)
              }}
              autoFocus
            />
          ) : (
            <span className="tree-name">{entry.name}</span>
          )}
        </div>

        {isFolder &&
          isOpen &&
          vault.entries
            .filter((child) => child.parentId === entry.id)
            .map((child) => renderVaultRow(child, depth + 1))}
      </div>
    )
  }

  function commitRename() {
    if (!renaming) return
    const value = renaming.value.trim()
    setRenaming(null)
    if (value) onRename(renaming.id, value)
  }

  // Read on open rather than on mount: templates are files, and the folder may
  // have been edited since this window started.
  function openTemplateMenu(event: MouseEvent<HTMLElement>) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    void listTemplates().then(setTemplates)
    setTemplateMenu({ x: rect.left, y: rect.bottom + 4 })
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

          {/* Hidden until the row is hovered, so a tree of folders is not a
              column of buttons. The context menu carries the same action for
              anyone who does not find it. */}
          {isFolder && canUseFiles && (
            <button
              type="button"
              className="tree-add"
              title={text.newFileHere}
              onClick={(event) => {
                // The row itself toggles the folder; this must not.
                event.stopPropagation()
                if (!isOpen) onToggleExpanded(node.id)
                onCreateFileIn(node.id)
              }}
            >
              <FilePlus size={12} aria-hidden="true" />
            </button>
          )}
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
        <button
          className="icon-button"
          type="button"
          title={notebookText.newFile}
          onClick={() => onCreateFile()}
        >
          <FilePlus size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={notebookText.newFromTemplate}
          onClick={openTemplateMenu}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={notebookText.newFolder}
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

      {vault && (
        <div className="sidebar-group vault-group">
          <div className="sidebar-head vault-head">
            <button type="button" className="vault-head-button" onClick={vault.onOpen}>
              {vault.unlocked ? (
                <ShieldCheck size={12} aria-hidden="true" />
              ) : (
                <Lock size={12} aria-hidden="true" />
              )}
              <span>{text.vault}</span>
            </button>
            {vault.unlocked && (
              <>
                <button
                  type="button"
                  className="tree-add"
                  title={notebookText.newFile}
                  onClick={() => vault.onCreateNote(null)}
                >
                  <FilePlus size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tree-add"
                  title={notebookText.newFolder}
                  onClick={() => vault.onCreateFolder(null)}
                >
                  <FolderPlus size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tree-add"
                  title={text.vaultLock}
                  onClick={vault.onLock}
                >
                  <Lock size={12} aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* Nothing at all while it is locked. Not even how many. */}
          {vault.unlocked &&
            (needle
              ? vault.entries
                  .filter((entry) => entry.name.toLowerCase().includes(needle))
                  .map((entry) => renderVaultRow(entry, 0))
              : vault.entries
                  .filter((entry) => entry.parentId === null)
                  .map((entry) => renderVaultRow(entry, 0)))}
          {vault.unlocked && vault.entries.length === 0 && (
            <p className="sidebar-empty">{text.vaultEmpty}</p>
          )}
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
            {strings.common.rename}
          </button>
          {canUseFiles && tree.folders.some((folder) => folder.id === menu.id) && (
            <button
              type="button"
              onClick={() => {
                onCreateFileIn(menu.id)
                setMenu(null)
              }}
            >
              {text.newFileHere}
            </button>
          )}
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
          {vault?.unlocked && (
            <button
              type="button"
              onClick={() => {
                vault.onImport(menu.id)
                setMenu(null)
              }}
            >
              {text.vaultMoveIn}
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
            {strings.common.delete}
          </button>
        </div>,
        document.body,
      )}

      {vaultMenu &&
        vault &&
        createPortal(
          <div className="sidebar-menu" style={{ left: vaultMenu.x, top: vaultMenu.y }}>
            <button
              type="button"
              onClick={() => {
                const entry = vault.entries.find((held) => held.id === vaultMenu.id)
                if (entry) setVaultRenaming({ id: entry.id, value: entry.name })
                setVaultMenu(null)
              }}
            >
              {strings.common.rename}
            </button>
            {vault.entries.some(
              (entry) => entry.id === vaultMenu.id && entry.kind === 'folder',
            ) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    vault.onCreateNote(vaultMenu.id)
                    setVaultMenu(null)
                  }}
                >
                  {text.newFileHere}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    vault.onCreateFolder(vaultMenu.id)
                    setVaultMenu(null)
                  }}
                >
                  {notebookText.newFolder}
                </button>
              </>
            )}
            {vault.entries.some(
              (entry) => entry.id === vaultMenu.id && entry.kind !== 'folder',
            ) && (
              <button
                type="button"
                onClick={() => {
                  vault.onExport(vaultMenu.id)
                  setVaultMenu(null)
                }}
              >
                {text.vaultMoveOut}
              </button>
            )}
            <button
              type="button"
              className="danger"
              onClick={() => {
                vault.onDelete(vaultMenu.id)
                setVaultMenu(null)
              }}
            >
              {strings.common.delete}
            </button>
          </div>,
          document.body,
        )}

      {templateMenu &&
        createPortal(
          <div
            className="sidebar-menu"
            style={{ left: templateMenu.x, top: templateMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {templates.map((template) => (
              <button
                key={template.name}
                type="button"
                onClick={() => {
                  onCreateFile(template)
                  setTemplateMenu(null)
                }}
              >
                {template.name}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export default NotebookSidebar
