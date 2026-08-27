// Notebook model: virtual folders over real files on disk, plus drafts that live
// as temp files until the user picks a home for them.
//
// Only metadata is kept in localStorage. Note bodies never go there — a note
// carries its pictures inside it, and a few screenshots are enough to blow past
// the 5 MB quota, at which point writes fail silently and text is lost. Drafts
// are `.dtnote` files under the app data directory; saved notes are read from
// and written to their own path, which stays the single source of truth for
// their content.

import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { deleteDraft, readDraft as readDraftFile, writeDraft as writeDraftFile } from './api/note'
import type { NoteDocument, NoteInput } from './api/note'
import { isTauri } from './env'
import { languages, locale } from './locales'

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

/** The one extension the app reads and writes. */
export const NOTE_EXTENSION = 'dtnote'

/** A note an earlier version wrote, which only the one-off migrator reads. */
export function isLegacyNotePath(path: string) {
  return /\.(?:md|markdown|txt)$/i.test(path)
}

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
// localStorage there and mapped files are simply unavailable. The fallback
// keeps text only: pictures are exactly what that quota cannot hold.

export async function readDraft(id: NodeId): Promise<NoteDocument> {
  if (!isTauri) {
    return { markdown: localStorage.getItem(`${DRAFT_FALLBACK_PREFIX}${id}`) ?? '', assets: [] }
  }
  return await readDraftFile(id)
}

export async function writeDraft(id: NodeId, document: NoteInput) {
  if (!isTauri) {
    localStorage.setItem(`${DRAFT_FALLBACK_PREFIX}${id}`, document.markdown)
    return
  }
  await writeDraftFile(id, document)
}

export async function deleteDraftFile(id: NodeId) {
  if (!isTauri) {
    localStorage.removeItem(`${DRAFT_FALLBACK_PREFIX}${id}`)
    return
  }
  await deleteDraft(id)
}

export async function renamePath(from: string, to: string) {
  await invoke('rename_path', { from, to })
}

export async function moveToRecycleBin(path: string) {
  await invoke('move_to_recycle_bin', { path })
}

export async function openInExplorer(path: string, select: boolean) {
  await invoke('open_in_explorer', { path, select })
}

export async function draftsDirectory() {
  if (!isTauri) return ''
  return await invoke<string>('drafts_directory')
}

// The dialogs offer one format, because the app reads one format. A `.md`
// picked here would be refused by the backend anyway — that is what
// `UNSUPPORTED_NOTE_TYPE` is for — and offering it in the filter would only
// make the refusal look like a bug.
const NOTE_FILTER = { name: 'DeskTime note', extensions: [NOTE_EXTENSION] }

export async function pickSavePath(suggested: string) {
  if (!isTauri) return null
  return await save({ defaultPath: suggested, filters: [NOTE_FILTER] })
}

/** Picks an existing note to map into the tree. */
export async function pickOpenPath() {
  if (!isTauri) return null

  const selected = await open({ multiple: false, filters: [NOTE_FILTER] })
  return typeof selected === 'string' ? selected : null
}

// —— Naming ——

const DRAFT_NUMBER = /(\d+)$/

/**
 * `<draft>n` in the current language, where n is one past the highest number
 * currently in the draft area.
 *
 * The number is read from a draft named in **any** language, not only the
 * current one. Someone who made 草稿1 and 草稿2 and then switched to English
 * would otherwise be handed "Draft 1" — a fresh count running alongside names
 * that are still on screen.
 *
 * Gaps are not reused — with 草稿1 and 草稿3 present the next one is 草稿4 — and
 * the number does fall back once a draft is deleted. That is the intended
 * behaviour, not an oversight.
 */
export function nextDraftName(drafts: DraftNode[]) {
  const prefixes = languages.map((entry) => entry.locale.notebookPanel.draftPrefix)

  const highest = drafts.reduce((max, draft) => {
    if (!prefixes.some((prefix) => draft.name.startsWith(prefix))) return max
    const match = DRAFT_NUMBER.exec(draft.name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `${locale().notebookPanel.draftPrefix}${highest + 1}`
}

// —— Attachments ——
//
// A pasted image becomes an entry inside the note itself, so there is no folder
// to choose and nothing to move when a draft is given a home. All that is left
// here is getting the bytes out of the browser; noteAssets.ts decides what the
// entry is called and turns it back into something an `<img>` can show.

/**
 * A file as base64, via the browser's own decoder.
 *
 * `FileReader` does this off the JS thread and without ever materialising the
 * bytes as JS values — `btoa(String.fromCharCode(...bytes))` would blow the call
 * stack on anything bigger than a thumbnail.
 */
export function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    // `readAsDataURL` gives `data:<type>;base64,<payload>`; only the payload is
    // wanted, and the comma cannot appear before it.
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1))
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'))
    reader.readAsDataURL(file)
  })
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
  return `${name}${match ? match[0] : `.${NOTE_EXTENSION}`}`
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
    name: locale().notebookPanel.legacyNote,
    updatedAt: Date.now(),
  }
  await writeDraft(draft.id, { markdown: legacy, assets: [] })

  return { ...tree, drafts: [...tree.drafts, draft] }
}
