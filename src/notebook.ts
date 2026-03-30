// Notebook model: virtual folders over real files on disk, plus drafts that live
// as temp files until the user picks a home for them.
//
// Only metadata is kept in localStorage. Note bodies never go there — pasted
// images are inline base64, and a few screenshots are enough to blow past the
// 5 MB quota, at which point writes fail silently and text is lost. Drafts go to
// real files under the app data directory; saved notes are read from and written
// to their own path, which stays the single source of truth for their content.

import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { isTauri } from './env'

export type NodeId = string

export type FolderNode = {
  id: NodeId
  kind: 'folder'
  name: string
  parentId: NodeId | null
  order: number
}

export type FileNode = {
  id: NodeId
  kind: 'file'
  /** Display name, kept identical to the on-disk file name. */
  name: string
  parentId: NodeId | null
  order: number
  path: string
  lastSavedAt: number
  missing?: boolean
}

export type DraftNode = {
  id: NodeId
  kind: 'draft'
  name: string
  updatedAt: number
}

export type NotebookNode = FolderNode | FileNode | DraftNode
export type TreeNode = FolderNode | FileNode

export type NotebookTree = {
  folders: FolderNode[]
  files: FileNode[]
  drafts: DraftNode[]
}

export type SidebarState = {
  open: boolean
  width: number
  expanded: NodeId[]
}

const TREE_KEY = 'desktime.notebook.tree'
const ACTIVE_KEY = 'desktime.notebook.activeId'
const SIDEBAR_KEY = 'desktime.notebook.sidebar'
const LEGACY_NOTE_KEY = 'desktime.note'
const DRAFT_FALLBACK_PREFIX = 'desktime.notebook.draft.'

export const SIDEBAR_MIN_WIDTH = 120
export const SIDEBAR_MAX_WIDTH = 300

export const emptyTree: NotebookTree = { folders: [], files: [], drafts: [] }

const defaultSidebar: SidebarState = { open: false, width: 180, expanded: [] }

// —— Storage ——

export function readTree(): NotebookTree {
  try {
    const value = localStorage.getItem(TREE_KEY)
    if (!value) return emptyTree
    return { ...emptyTree, ...(JSON.parse(value) as Partial<NotebookTree>) }
  } catch {
    return emptyTree
  }
}

export function saveTree(tree: NotebookTree) {
  localStorage.setItem(TREE_KEY, JSON.stringify(tree))
}

export function readActiveId(): NodeId | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id: NodeId | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function readSidebar(): SidebarState {
  try {
    const value = localStorage.getItem(SIDEBAR_KEY)
    if (!value) return defaultSidebar
    return { ...defaultSidebar, ...(JSON.parse(value) as Partial<SidebarState>) }
  } catch {
    return defaultSidebar
  }
}

export function saveSidebar(state: SidebarState) {
  localStorage.setItem(SIDEBAR_KEY, JSON.stringify(state))
}

// —— Content IO ——
//
// The browser prototype (`npm run dev`) has no IPC, so drafts fall back to
// localStorage there and mapped files are simply unavailable.

export async function readDraft(id: NodeId): Promise<string> {
  if (!isTauri) return localStorage.getItem(`${DRAFT_FALLBACK_PREFIX}${id}`) ?? ''
  return await invoke<string>('draft_read', { id })
}

export async function writeDraft(id: NodeId, contents: string) {
  if (!isTauri) {
    localStorage.setItem(`${DRAFT_FALLBACK_PREFIX}${id}`, contents)
    return
  }
  await invoke('draft_write', { id, contents })
}

export async function deleteDraftFile(id: NodeId) {
  if (!isTauri) {
    localStorage.removeItem(`${DRAFT_FALLBACK_PREFIX}${id}`)
    return
  }
  await invoke('draft_delete', { id })
}

export async function readFile(path: string) {
  return await invoke<string>('read_text_file', { path })
}

export async function writeFile(path: string, contents: string) {
  await invoke('save_text_file', { path, contents })
}

export async function renamePath(from: string, to: string) {
  await invoke('rename_path', { from, to })
}

export async function moveToRecycleBin(path: string) {
  await invoke('move_to_recycle_bin', { path })
}

export async function fileExists(path: string) {
  const stat = await invoke<{ exists: boolean }>('file_stat', { path })
  return stat.exists
}

export async function openInExplorer(path: string, select: boolean) {
  await invoke('open_in_explorer', { path, select })
}

export async function draftsDirectory() {
  if (!isTauri) return ''
  return await invoke<string>('drafts_directory')
}

export async function pickSavePath(suggested: string) {
  if (!isTauri) return null
  return await save({
    defaultPath: suggested,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  })
}

/** Picks an existing note to map into the tree. */
export async function pickOpenPath() {
  if (!isTauri) return null

  const selected = await open({
    multiple: false,
    filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }],
  })
  return typeof selected === 'string' ? selected : null
}

// —— Naming ——

const DRAFT_NAME_PATTERN = /^草稿(\d+)$/

/**
 * `草稿n`, where n is one past the highest number currently in the draft area.
 *
 * Gaps are not reused — with 草稿1 and 草稿3 present the next one is 草稿4 — and
 * the number does fall back once a draft is deleted. That is the intended
 * behaviour, not an oversight.
 */
export function nextDraftName(drafts: DraftNode[]) {
  const highest = drafts.reduce((max, draft) => {
    const match = DRAFT_NAME_PATTERN.exec(draft.name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `草稿${highest + 1}`
}

export function fileNameOf(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

export function parentDirOf(path: string) {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(0, index) : ''
}

export function joinPath(dir: string, name: string) {
  return `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`
}

/** Keeps the original extension when the user types a bare name. */
export function withExtension(name: string, previous: string) {
  if (/\.[A-Za-z0-9]+$/.test(name)) return name
  const match = /\.[A-Za-z0-9]+$/.exec(previous)
  return `${name}${match ? match[0] : '.md'}`
}

// —— Tree ——

export function findNode(tree: NotebookTree, id: NodeId): NotebookNode | undefined {
  return (
    tree.folders.find((node) => node.id === id) ??
    tree.files.find((node) => node.id === id) ??
    tree.drafts.find((node) => node.id === id)
  )
}

export function childrenOf(tree: NotebookTree, parentId: NodeId | null): TreeNode[] {
  return [...tree.folders, ...tree.files]
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

export function nextOrder(tree: NotebookTree, parentId: NodeId | null) {
  const siblings = childrenOf(tree, parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((node) => node.order)) + 1
}

/** True when `candidate` sits somewhere inside `ancestor`'s subtree. */
export function isDescendant(tree: NotebookTree, candidate: NodeId, ancestor: NodeId) {
  let current = tree.folders.find((node) => node.id === candidate)?.parentId ?? null
  while (current) {
    if (current === ancestor) return true
    current = tree.folders.find((node) => node.id === current)?.parentId ?? null
  }
  return false
}

/**
 * Reparents and reorders one node. `beforeId` is the sibling it should land in
 * front of; `null` appends. Purely an app-side arrangement — nothing on disk
 * moves, because the folders are virtual.
 */
export function moveNode(
  tree: NotebookTree,
  nodeId: NodeId,
  parentId: NodeId | null,
  beforeId: NodeId | null,
): NotebookTree {
  const node = findNode(tree, nodeId)
  if (!node || node.kind === 'draft') return tree

  // Dropping a folder into its own subtree would detach that branch entirely.
  if (node.kind === 'folder' && parentId && (parentId === nodeId || isDescendant(tree, parentId, nodeId))) {
    return tree
  }

  const siblings = childrenOf(tree, parentId).filter((entry) => entry.id !== nodeId)
  const index = beforeId ? siblings.findIndex((entry) => entry.id === beforeId) : -1
  const ordered =
    index >= 0
      ? [...siblings.slice(0, index), node, ...siblings.slice(index)]
      : [...siblings, node]

  const orders = new Map(ordered.map((entry, position) => [entry.id, position]))
  function apply<T extends TreeNode>(entry: T): T {
    const order = orders.get(entry.id)
    if (order === undefined) return entry
    return entry.id === nodeId ? { ...entry, parentId, order } : { ...entry, order }
  }

  return {
    ...tree,
    folders: tree.folders.map(apply),
    files: tree.files.map(apply),
  }
}

/** Every folder and file under `folderId`, including the folder itself. */
export function collectSubtree(tree: NotebookTree, folderId: NodeId) {
  const folders: FolderNode[] = []
  const files: FileNode[] = []

  function walk(id: NodeId) {
    tree.folders
      .filter((folder) => folder.parentId === id)
      .forEach((folder) => {
        folders.push(folder)
        walk(folder.id)
      })
    tree.files.filter((file) => file.parentId === id).forEach((file) => files.push(file))
  }

  const root = tree.folders.find((folder) => folder.id === folderId)
  if (root) {
    folders.push(root)
    walk(folderId)
  }

  return { folders, files }
}

/**
 * Moves the single pre-notebook note into a draft so upgrading never loses it.
 * Runs once: the old key is dropped whether or not it held anything.
 */
export async function migrateLegacyNote(tree: NotebookTree): Promise<NotebookTree> {
  const legacy = localStorage.getItem(LEGACY_NOTE_KEY)
  if (legacy === null) return tree

  localStorage.removeItem(LEGACY_NOTE_KEY)
  if (!legacy.trim()) return tree

  const draft: DraftNode = {
    id: crypto.randomUUID(),
    kind: 'draft',
    name: '临时记事（旧）',
    updatedAt: Date.now(),
  }
  await writeDraft(draft.id, legacy)

  return { ...tree, drafts: [...tree.drafts, draft] }
}
