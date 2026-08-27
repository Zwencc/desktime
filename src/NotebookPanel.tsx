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
import {
  createNote,
  executeLegacyMigration,
  openNote,
  relocateNote,
  saveNote,
  scanLegacyNotes,
} from './api/note'
import type { MigrationPlan, MigrationResult, NoteDocument, NoteInput } from './api/note'
import {
  createVaultFolder,
  createVaultNote,
  deleteVaultEntry,
  exportFromVault,
  importIntoVault,
  listVault,
  lockVault,
  readVaultNote,
  renameVaultEntry,
  vaultStatus as readVaultStatus,
  writeVaultBackup,
  writeVaultNote,
} from './api/vault'
import type { VaultEntry, VaultStatus } from './api/vault'
import { emptyAssets, nextAssetPath, revokeAll, toBlobUrls } from './noteAssets'
import type { AssetUrls } from './noteAssets'
import { isTauri } from './env'
import { NoteEditor } from './NoteEditor'
import { NotebookSidebar } from './NotebookSidebar'
import { VaultAuth } from './VaultAuth'
import { readPinnedState, readVisibleState, subscribePanelState } from './panels'
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
  NOTE_EXTENSION,
  draftsDirectory,
  fileNameOf,
  findNode,
  isLegacyNotePath,
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
  readAsBase64,
  readDraft,
  readSidebar,
  readTree,
  renamePath,
  saveActiveId,
  saveSidebar,
  saveTree,
  withExtension,
  writeDraft,
} from './notebook'
import { readSettings, subscribeSettings } from './settings'
import { useLocale } from './locales'
import { type Template, applyTemplate } from './templates'
import { formatHm } from './time'


/** Editor width to protect when the sidebar is opened on a narrow window. */
const EDITOR_MIN_WIDTH = 260

/** Files listed by name in the folder-delete confirmation before collapsing. */
const NAMED_FILES = 5

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; message: string }
  // Carries the reason rather than a sentence, so `loadNode` does not have to
  // depend on the current language — it is called from the mount effect, and a
  // dependency that changes when the language does would re-run that effect and
  // reload the open note over whatever was being typed into it.
  | { kind: 'openError'; reason: string }

/** Nothing open, or nothing left after a delete. */
const EMPTY_NOTE = { markdown: '', assets: [] }

/**
 * How a vault entry is addressed in `activeId`.
 *
 * One field rather than two, so every save, autosave, blur flush and close
 * handler keeps working unchanged and only the two ends — loading and
 * persisting — know the difference.
 */
const VAULT_PREFIX = 'vault:'

function vaultIdOf(id: NodeId | null | undefined) {
  return id?.startsWith(VAULT_PREFIX) ? id.slice(VAULT_PREFIX.length) : null
}

type Confirm =
  | { kind: 'file'; id: NodeId; name: string }
  | { kind: 'draft'; id: NodeId; name: string }
  | { kind: 'folder'; id: NodeId; name: string; files: FileNode[] }
  | { kind: 'vaultEntry'; id: string; name: string }
  /** The second of the two confirmations moving a note back into the open. */
  | { kind: 'vaultExport'; id: string; name: string }

export function NotebookPanel() {
  const strings = useLocale()
  const text = strings.notebookPanel
  const [tree, setTree] = useState<NotebookTree>(readTree)
  const [activeId, setActiveId] = useState<NodeId | null>(readActiveId)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })
  const [sidebar, setSidebar] = useState<SidebarState>(readSidebar)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [autoSaveSeconds, setAutoSaveSeconds] = useState(() => readSettings().autoSaveSeconds)
  const [lockMinutes, setLockMinutes] = useState(() => readSettings().vaultLockMinutes)
  // The open note's pictures, as blob URLs. Replaced wholesale on every switch,
  // which is also when the old ones are revoked.
  const [assets, setAssets] = useState<AssetUrls>(emptyAssets)
  const [migration, setMigration] = useState<MigrationPlan | null>(null)
  const [migrated, setMigrated] = useState<MigrationResult[] | null>(null)
  const [vault, setVault] = useState<VaultStatus | null>(null)
  /** The session handle while the vault is open, and nothing derived from a key. */
  const [session, setSession] = useState<string | null>(null)
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([])
  const [vaultExpanded, setVaultExpanded] = useState<string[]>([])
  const [showAuth, setShowAuth] = useState(false)
  const [notice, setNotice] = useState<{ title: string; lines: string[] } | null>(null)

  // Flush handlers fire outside React's render flow (blur, window close), so the
  // live values have to be reachable without going through a stale closure.
  const treeRef = useRef(tree)
  const contentRef = useRef(content)
  const dirtyRef = useRef(dirty)
  const activeIdRef = useRef(activeId)
  const assetsRef = useRef(assets)
  // Pictures pasted since the last successful save, still only in this window.
  // Everything else is already in the file and travels as a name.
  const pendingRef = useRef(new Map<string, string>())
  // The vault session. A ref as well as state because locking happens from a
  // timer and from a window event, neither of which goes through a render.
  const sessionRef = useRef<string | null>(null)
  const vaultRevisionRef = useRef(0)
  // When the user was last doing something. Compared against, never added up.
  const lastActivityRef = useRef(Date.now())

  treeRef.current = tree
  contentRef.current = content
  dirtyRef.current = dirty
  activeIdRef.current = activeId
  assetsRef.current = assets

  const activeNode = activeId ? findNode(tree, activeId) : undefined
  const activeVaultId = vaultIdOf(activeId)

  /**
   * Remembers what was open, unless what was open was private.
   *
   * A vault entry id is one half of the map between a note and the object that
   * holds it, and that map is supposed to live in the encrypted index. Writing
   * it to localStorage would leave a piece of it readable with the vault locked.
   */
  const rememberActive = useCallback((id: NodeId | null) => {
    saveActiveId(vaultIdOf(id) ? null : id)
  }, [])
  // Resolved once: it is a fixed folder for the whole run, and both the image
  // saver and the preview need it synchronously.
  const [draftsDir, setDraftsDir] = useState('')

  useEffect(() => {
    void draftsDirectory().then(setDraftsDir)
  }, [])

  /** The draft's own file, which is an ordinary note in the drafts folder. */
  const draftFile = useCallback(
    (id: NodeId) => joinPath(draftsDir, `${id}.${NOTE_EXTENSION}`),
    [draftsDir],
  )

  /**
   * The note as it stands: the text, and every picture in it by name.
   *
   * Only what was pasted in this window since the last save carries its bytes.
   * The rest are already inside the file being replaced, and the backend copies
   * them across — which is what keeps a ten-second autosave of a note full of
   * screenshots from shipping all of them over the boundary every time.
   */
  const documentFor = useCallback(
    (body: string): NoteInput => ({
      markdown: body,
      assets: [...assetsRef.current.keys()]
        // A picture pasted and then taken straight back out — the wrong
        // screenshot, an undo — never reaches the file. This is checked only
        // for pending ones, whose paths this window made and which are plain
        // `assets/<n>.<ext>`: a picture already in the note is left alone even
        // if nothing appears to reference it, because deciding that from the
        // text means matching every way markdown can spell a path, and getting
        // that wrong deletes someone's picture.
        .filter((path) => !pendingRef.current.has(path) || body.includes(path))
        .map((path) => ({ path, base64: pendingRef.current.get(path) ?? null })),
    }),
    [],
  )

  /**
   * Brings the editor's idea of the note's pictures back in line with the file
   * that was just written.
   *
   * The only difference is a picture `documentFor` filtered out — pasted and
   * then taken back out before the save caught up. It never reached the file,
   * so it stops being one of the note's pictures and its blob URL goes with it.
   */
  const commit = useCallback((document: NoteInput) => {
    const written = new Set(document.assets.map((asset) => asset.path))
    pendingRef.current.clear()
    if (written.size === assetsRef.current.size) return

    const urls = new Map<string, string>()
    assetsRef.current.forEach((url, path) => {
      if (written.has(path)) urls.set(path, url)
      else URL.revokeObjectURL(url)
    })
    assetsRef.current = urls
    setAssets(urls)
  }, [])

  /** Shows a note, and lets go of the pictures of the one being left. */
  const applyDocument = useCallback((document: NoteDocument) => {
    // The browser keeps the bytes behind a blob URL alive until it is told
    // otherwise, so this is the difference between browsing a notebook for an
    // afternoon and holding every picture of every note opened in it.
    revokeAll(assetsRef.current)
    const urls = toBlobUrls(document.assets)
    assetsRef.current = urls
    setAssets(urls)
    pendingRef.current.clear()
    setContent(document.markdown)
    setDirty(false)
  }, [])

  useEffect(() => () => revokeAll(assetsRef.current), [])

  /**
   * Takes a pasted or dropped image into the open note and returns the path to
   * write into the markdown.
   *
   * Nothing reaches the disk here: the picture goes into the note, and the note
   * is written by the save that follows. That is what a draft being a real note
   * bought — there is no longer a "somewhere to put it until this has a home".
   *
   * A failure is reported rather than swallowed. The caller's answer to `null`
   * is to insert nothing, which from the other side of the screen is
   * indistinguishable from a paste that was never noticed.
   */
  const saveImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!isTauri) return null
      if (!activeVaultId && (!activeNode || activeNode.kind === 'folder')) return null

      try {
        const path = nextAssetPath(assetsRef.current.keys(), file.name)
        pendingRef.current.set(path, await readAsBase64(file))
        const urls = new Map(assetsRef.current).set(path, URL.createObjectURL(file))
        assetsRef.current = urls
        setAssets(urls)
        return path
      } catch {
        setStatus({ kind: 'error', message: text.saveFailed })
        return null
      }
    },
    [activeNode, activeVaultId, text.saveFailed],
  )

  useEffect(() => {
    saveTree(tree)
  }, [tree])

  useEffect(
    () =>
      subscribeSettings((next) => {
        setAutoSaveSeconds(next.autoSaveSeconds)
        setLockMinutes(next.vaultLockMinutes)
      }),
    [],
  )

  useEffect(() => {
    saveSidebar(sidebar)
  }, [sidebar])

  /**
   * Saves one private note, and if that fails, saves it somewhere still private.
   *
   * The plain path parks a failed save in a draft, which is a readable file on
   * disk. Doing that with a note from the vault would mean one full disk turns
   * a private note into a public one, so the last resort here is encrypted and
   * inside the vault as well.
   */
  const persistVault = useCallback(
    async (handle: string, entryId: string, body: string) => {
      setStatus({ kind: 'saving' })
      const document = documentFor(body)
      try {
        const entry = await writeVaultNote(handle, entryId, vaultRevisionRef.current, document)
        vaultRevisionRef.current = entry.revision
        setVaultEntries((current) =>
          current.map((held) => (held.id === entry.id ? entry : held)),
        )
        commit(document)
        setDirty(false)
        setStatus({ kind: 'saved', at: formatHm(new Date()) })
      } catch {
        try {
          await writeVaultBackup(handle, entryId, {
            markdown: body,
            assets: [...pendingRef.current].map(([path, base64]) => ({ path, base64 })),
          })
          setVaultEntries(await listVault(handle))
          setStatus({ kind: 'error', message: text.vaultBackedUp })
        } catch {
          // Both places are gone. Say so plainly rather than leaving a "saved"
          // that is not true — and, when this happens during a lock, lock anyway.
          setStatus({ kind: 'error', message: text.vaultSaveLost })
        }
      }
    },
    [commit, documentFor, text.vaultBackedUp, text.vaultSaveLost],
  )

  const persist = useCallback(async (id: NodeId, body: string) => {
    const entryId = vaultIdOf(id)
    if (entryId) {
      const handle = sessionRef.current
      if (handle) await persistVault(handle, entryId, body)
      return
    }

    const node = findNode(treeRef.current, id)
    if (!node) return

    setStatus({ kind: 'saving' })
    const document = documentFor(body)
    try {
      if (node.kind === 'draft') {
        await writeDraft(id, document)
      } else if (node.kind === 'file') {
        await saveNote(node.path, document)
        setTree((current) => ({
          ...current,
          files: current.files.map((file) =>
            file.id === id ? { ...file, lastSavedAt: Date.now(), missing: false } : file,
          ),
        }))
      }

      // The pictures are in the file now, so the next save can name them
      // instead of carrying them.
      commit(document)
      setDirty(false)
      setStatus({ kind: 'saved', at: formatHm(new Date()) })
    } catch {
      // The target may be locked, on a removed drive, or read-only. Park the text
      // in a backup draft rather than letting the edit evaporate — with whatever
      // was pasted into it, since those bytes exist nowhere else yet.
      try {
        await writeDraft(`${id}-backup`, {
          markdown: body,
          assets: [...pendingRef.current].map(([path, base64]) => ({ path, base64 })),
        })
      } catch {
        // Nothing left to try; the error status below is the honest report.
      }
      setStatus({ kind: 'error', message: text.saveFailed })
    }
  }, [commit, documentFor, persistVault, text.saveFailed])

  /**
   * Drops the session key and everything decrypted that hangs off it.
   *
   * It always finishes. A note that could not be saved and could not be backed
   * up still gets locked away, with the failure said out loud — a full disk is
   * not a reason to leave someone's private note decrypted on screen.
   */
  const lockNow = useCallback(async () => {
    const handle = sessionRef.current
    if (!handle) return
    sessionRef.current = null

    const entryId = vaultIdOf(activeIdRef.current)
    if (entryId && dirtyRef.current) {
      try {
        await persistVault(handle, entryId, contentRef.current)
      } catch {
        setStatus({ kind: 'error', message: text.vaultSaveLost })
      }
    }

    try {
      await lockVault(handle)
    } catch {
      // The handle is already unusable from this side; the key going is what
      // matters and the backend drops it either way.
    }

    setSession(null)
    setVaultEntries([])
    setVaultExpanded([])
    setShowAuth(false)
    if (entryId) {
      setActiveId(null)
      rememberActive(null)
      applyDocument(EMPTY_NOTE)
    }
    void readVaultStatus().then(setVault).catch(() => undefined)
  }, [applyDocument, persistVault, rememberActive, text.vaultSaveLost])

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

  useEffect(() => {
    if (!isTauri) return
    void readVaultStatus()
      .then(setVault)
      .catch(() => undefined)
  }, [])

  // Every gesture in the window counts as being present.
  useEffect(() => {
    if (!session) return
    function seen() {
      lastActivityRef.current = Date.now()
    }
    const events = ['keydown', 'mousedown', 'wheel', 'pointermove'] as const
    events.forEach((name) => window.addEventListener(name, seen, true))
    return () => events.forEach((name) => window.removeEventListener(name, seen, true))
  }, [session])

  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => {
      // A comparison against a timestamp, never a running total. WebView2
      // throttles timers in a backgrounded window, and a counter that added up
      // its own ticks would simply stop reaching the limit — the vault would
      // stay open exactly when it matters most. A late tick locks late; a late
      // counter never locks at all.
      if (Date.now() - lastActivityRef.current >= lockMinutes * 60_000) void lockNow()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session, lockMinutes, lockNow])

  // Hidden, or sunk to the desktop layer. Unpinned is not hidden — the note is
  // still on screen and still rendering, just behind everything else — which is
  // exactly why it has to lock too.
  useEffect(() => {
    if (!session) return
    let pinned = readPinnedState('note')
    let visible = readVisibleState('note')

    return subscribePanelState((widget) => {
      if (widget !== 'note') return
      const nextPinned = readPinnedState('note')
      const nextVisible = readVisibleState('note')
      // The change is the signal, not the state: someone who has just typed a
      // password into an unpinned widget is looking straight at it, and locking
      // on the level alone would make an unpinned notebook impossible to use.
      if ((pinned && !nextPinned) || (visible && !nextVisible)) void lockNow()
      pinned = nextPinned
      visible = nextVisible
    })
  }, [session, lockNow])

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
    const entryId = vaultIdOf(id)
    if (entryId) {
      const handle = sessionRef.current
      if (!handle) {
        applyDocument(EMPTY_NOTE)
        return
      }
      try {
        const read = await readVaultNote(handle, entryId)
        vaultRevisionRef.current = read.entry.revision
        applyDocument(read.document)
        setStatus({ kind: 'idle' })
      } catch (error) {
        applyDocument(EMPTY_NOTE)
        setStatus({ kind: 'openError', reason: String(error) })
      }
      return
    }

    const node = id ? findNode(treeRef.current, id) : undefined
    if (!node || node.kind === 'folder') {
      applyDocument(EMPTY_NOTE)
      return
    }

    if (node.kind === 'draft') {
      applyDocument(await readDraft(node.id))
      setStatus({ kind: 'idle' })
      return
    }

    try {
      applyDocument(await openNote(node.path))
      setTree((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === node.id ? { ...file, missing: false } : file,
        ),
      }))
      setStatus({ kind: 'idle' })
    } catch (error) {
      applyDocument(EMPTY_NOTE)
      setTree((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === node.id ? { ...file, missing: true } : file,
        ),
      }))
      // A note from before v0.1.5 lands here, and "file is missing" would be
      // the wrong thing to tell someone whose file is right where they left it.
      setStatus({ kind: 'openError', reason: String(error) })
    }
  }, [applyDocument])

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

      // Notes from before v0.1.5 cannot be opened any more, so the offer to
      // convert them comes up as soon as the notebook knows about them. The
      // scan only reads: nothing on disk moves until the list has been seen.
      const legacy = migrated.files.filter((file) => isLegacyNotePath(file.path))
      if (isTauri && legacy.length > 0) {
        try {
          setMigration(await scanLegacyNotes(legacy.map((file) => file.path)))
        } catch {
          // Offered again next launch; the notes are untouched either way.
        }
      }
    })()
  }, [loadNode])

  async function selectNode(id: NodeId) {
    if (id === activeId) return

    // Switching always saves first — that is why there is no prompt.
    if (activeIdRef.current && dirtyRef.current) {
      await persist(activeIdRef.current, contentRef.current)
    }
    // Opening an ordinary note is leaving the vault, and leaving it locks it.
    if (vaultIdOf(activeIdRef.current) && !vaultIdOf(id)) await lockNow()

    setActiveId(id)
    rememberActive(id)
    await loadNode(id)
  }

  // —— The vault ——

  async function refreshEntries(handle: string) {
    try {
      setVaultEntries(await listVault(handle))
    } catch {
      // The session went while this was in flight; the lock path clears the
      // list anyway.
    }
  }

  async function vaultUnlocked(handle: string) {
    sessionRef.current = handle
    setSession(handle)
    lastActivityRef.current = Date.now()
    setShowAuth(false)
    await refreshEntries(handle)
    void readVaultStatus().then(setVault).catch(() => undefined)
  }

  /** A name nothing in this folder is called yet. */
  function freshName(base: string, parentId: string | null) {
    const taken = new Set(
      vaultEntries.filter((entry) => entry.parentId === parentId).map((entry) => entry.name),
    )
    if (!taken.has(base)) return base

    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const extension = dot > 0 ? base.slice(dot) : ''
    for (let index = 2; ; index += 1) {
      const candidate = `${stem} ${index}${extension}`
      if (!taken.has(candidate)) return candidate
    }
  }

  function vaultAction(run: (handle: string) => Promise<void>) {
    const handle = sessionRef.current
    if (!handle) return
    void (async () => {
      try {
        await run(handle)
      } catch (error) {
        setStatus({ kind: 'error', message: text.vaultFailed(String(error)) })
      }
    })()
  }

  function createVaultItem(parentId: string | null, folder: boolean) {
    vaultAction(async (handle) => {
      if (activeIdRef.current && dirtyRef.current) {
        await persist(activeIdRef.current, contentRef.current)
      }

      const name = freshName(folder ? text.newFolderName : text.vaultNewNote, parentId)
      const entry = folder
        ? await createVaultFolder(handle, parentId, name)
        : await createVaultNote(handle, parentId, name)

      await refreshEntries(handle)
      if (parentId) setVaultExpanded((current) => [...new Set([...current, parentId])])
      if (folder) return

      const id = `${VAULT_PREFIX}${entry.id}`
      setActiveId(id)
      rememberActive(id)
      await loadNode(id)
    })
  }

  async function selectVaultEntry(entryId: string) {
    const id = `${VAULT_PREFIX}${entryId}`
    if (id === activeIdRef.current) return
    if (activeIdRef.current && dirtyRef.current) {
      await persist(activeIdRef.current, contentRef.current)
    }
    setShowAuth(false)
    setActiveId(id)
    rememberActive(id)
    await loadNode(id)
  }

  /**
   * Moves a plain note, or a whole folder of them, into the vault.
   *
   * One file at a time, because a batch that stopped halfway and reported one
   * failure would leave the user with no idea which of their notes are now
   * private and which are still lying about.
   */
  function moveIntoVault(nodeId: NodeId) {
    vaultAction(async (handle) => {
      const node = findNode(treeRef.current, nodeId)
      if (!node) return

      // Written first, because a draft's file is what gets moved in and the
      // text on screen may not have reached it yet.
      if (activeIdRef.current && dirtyRef.current) {
        await persist(activeIdRef.current, contentRef.current)
      }

      // A draft is an ordinary note in the drafts folder, so it moves in the
      // same way — and the plaintext file it leaves behind is unlinked rather
      // than recycled, which is the whole reason this is not a copy.
      const files: { id: NodeId; name: string; path: string }[] =
        node.kind === 'draft'
          ? [{ id: node.id, name: node.name, path: draftFile(node.id) }]
          : node.kind === 'file'
            ? [node]
            : collectSubtree(treeRef.current, nodeId).files
      if (files.length === 0) return

      const moved = new Set<NodeId>()
      const lines: string[] = []
      for (const file of files) {
        try {
          const result = await importIntoVault(handle, file.path, null)
          moved.add(file.id)
          if (!result.sourceRemoved) lines.push(text.vaultKeptPlain(file.name))
        } catch (error) {
          lines.push(text.vaultNotMoved(file.name, String(error)))
        }
      }

      dropNodes(moved)
      await refreshEntries(handle)
      setNotice({ title: text.vaultMoveInTitle, lines: [text.vaultMovedIn(moved.size), ...lines] })
    })
  }

  function moveOutOfVault(entry: VaultEntry) {
    vaultAction(async (handle) => {
      const path = await pickSavePath(entry.name)
      if (!path) return
      // The backend refuses without this flag as well, so the confirmation the
      // user just gave is enforced on both sides rather than only drawn.
      await exportFromVault(handle, entry.id, path, true)

      if (vaultIdOf(activeIdRef.current) === entry.id) {
        setActiveId(null)
        rememberActive(null)
        applyDocument(EMPTY_NOTE)
      }
      await refreshEntries(handle)
      setStatus({ kind: 'saved', at: formatHm(new Date()) })
    })
  }

  // A template only decides the starting text. Everything after that — the
  // autosave, "save as", the backup on a failed write — is the draft path
  // unchanged, which is the whole reason templates create drafts rather than
  // files: none of it had to be written twice.
  function createFile(template?: Template) {
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
      const body = template ? applyTemplate(template.body, draft.name) : ''

      // Written straight away so the draft exists on disk from the first keystroke.
      await writeDraft(draft.id, { markdown: body, assets: [] })
      setTree((current) => ({ ...current, drafts: [...current.drafts, draft] }))
      setActiveId(draft.id)
      rememberActive(draft.id)
      applyDocument({ markdown: body, assets: [] })
      setStatus({ kind: 'idle' })
    })()
  }

  /**
   * Creates a file **inside a folder**, through the save dialog.
   *
   * A different gesture from the toolbar's "new note", and deliberately so:
   * that one makes a draft, and a draft cannot sit in a folder — the tree's
   * folders hold real files, which is the whole distinction between the two
   * regions of the sidebar. Filling a folder therefore has to ask where the
   * file goes before there is anything to put in it.
   */
  function createFileIn(parentId: NodeId) {
    void (async () => {
      if (activeIdRef.current && dirtyRef.current) {
        await persist(activeIdRef.current, contentRef.current)
      }

      const path = await pickSavePath(
        `${nextDraftName(treeRef.current.drafts)}.${NOTE_EXTENSION}`,
      )
      if (!path) return

      setStatus({ kind: 'saving' })
      try {
        await createNote(path)
      } catch {
        setStatus({ kind: 'error', message: text.saveFailed })
        return
      }

      const file: FileNode = {
        id: crypto.randomUUID(),
        kind: 'file',
        name: fileNameOf(path),
        parentId,
        order: nextOrder(treeRef.current, parentId),
        path,
        lastSavedAt: Date.now(),
      }

      setTree((current) => ({ ...current, files: [...current.files, file] }))
      setActiveId(file.id)
      rememberActive(file.id)
      applyDocument(EMPTY_NOTE)
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
      rememberActive(file.id)
      await loadNode(file.id)
    })()
  }

  /**
   * Gives a draft a home.
   *
   * A draft is already a note, so this writes what is on screen into it and
   * then moves the file. Nothing is unpacked, no picture moves separately and
   * no path in the text is rewritten — which is the whole of what putting the
   * pictures inside the note bought here.
   */
  async function promoteDraft(draft: DraftNode) {
    if (!draftsDir) return false
    const path = await pickSavePath(`${draft.name}.${NOTE_EXTENSION}`)
    if (!path) return false

    setStatus({ kind: 'saving' })
    const document = documentFor(contentRef.current)
    try {
      await writeDraft(draft.id, document)
      commit(document)
      await relocateNote(draftFile(draft.id), path, false)
    } catch {
      setStatus({ kind: 'error', message: text.saveFailed })
      return false
    }

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
    if (activeVaultId) {
      void persist(`${VAULT_PREFIX}${activeVaultId}`, contentRef.current)
      return
    }
    if (!activeNode) return
    if (activeNode.kind === 'draft') {
      void promoteDraft(activeNode)
      return
    }
    if (activeNode.kind === 'file') void persist(activeNode.id, contentRef.current)
  }

  function saveAs() {
    if (activeVaultId) {
      // Writing a private note somewhere is exactly "move it out", and that is
      // the operation that has to be confirmed rather than performed.
      const entry = vaultEntries.find((held) => held.id === activeVaultId)
      if (entry) setConfirm({ kind: 'vaultExport', id: entry.id, name: entry.name })
      return
    }
    if (!activeNode || activeNode.kind === 'folder') return
    // A draft has no copy to make: it has one file and no home, so "save as" is
    // the same gesture as giving it one.
    if (activeNode.kind === 'draft') {
      void promoteDraft(activeNode)
      return
    }

    void (async () => {
      const path = await pickSavePath(activeNode.name)
      if (!path) return
      if (path === activeNode.path) {
        void persist(activeNode.id, contentRef.current)
        return
      }

      setStatus({ kind: 'saving' })
      const document = documentFor(contentRef.current)
      try {
        // The copy starts life as the note that is open, pictures and all, and
        // the text on screen goes into it afterwards. Copying first is what
        // lets that save name the pictures rather than carry them.
        await relocateNote(activeNode.path, path, true)
        await saveNote(path, document)
        commit(document)
      } catch {
        setStatus({ kind: 'error', message: text.saveFailed })
        return
      }

      setTree((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === activeNode.id
            ? { ...file, path, name: fileNameOf(path), lastSavedAt: Date.now(), missing: false }
            : file,
        ),
      }))

      setDirty(false)
      setStatus({ kind: 'saved', at: formatHm(new Date()) })
    })()
  }

  /**
   * Converts the plan the user just approved, then points the tree at what came
   * out of it.
   *
   * The plan is the one the backend handed out and is good for one answer, so
   * what runs is what was on screen and it cannot run twice.
   */
  async function runMigration(plan: MigrationPlan) {
    setMigration(null)
    setStatus({ kind: 'saving' })

    let results: MigrationResult[]
    try {
      results = await executeLegacyMigration(plan.planId)
    } catch (error) {
      setStatus({ kind: 'error', message: text.migrateFailed(String(error)) })
      return
    }

    const converted = new Map(
      results
        .filter((result) => result.succeeded && result.targetDtnote)
        .map((result) => [result.sourceMarkdown, result.targetDtnote as string]),
    )
    const next: NotebookTree = {
      ...treeRef.current,
      files: treeRef.current.files.map((file) => {
        const target = converted.get(file.path)
        return target
          ? { ...file, path: target, name: fileNameOf(target), missing: false }
          : file
      }),
    }
    setTree(next)
    treeRef.current = next
    setMigrated(results)
    setStatus({ kind: 'idle' })

    // The note on screen may have just become a different file.
    const active = activeIdRef.current
    if (active && findNode(next, active)?.kind === 'file') await loadNode(active)
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
      rememberActive(null)
      setContent('')
      setDirty(false)
    }
  }

  async function runDelete(target: Confirm) {
    setConfirm(null)

    if (target.kind === 'vaultExport') {
      const entry = vaultEntries.find((held) => held.id === target.id)
      if (entry) moveOutOfVault(entry)
      return
    }

    if (target.kind === 'vaultEntry') {
      vaultAction(async (handle) => {
        await deleteVaultEntry(handle, target.id)
        if (vaultIdOf(activeIdRef.current) === target.id) {
          setActiveId(null)
          rememberActive(null)
          applyDocument(EMPTY_NOTE)
        }
        await refreshEntries(handle)
      })
      return
    }

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
  const failed = status.kind === 'error' || status.kind === 'openError'
  const statusLabel =
    status.kind === 'saving'
      ? text.saving
      : status.kind === 'error'
        ? status.message
        : status.kind === 'openError'
          ? text.openFailed(status.reason)
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
              onCreateFileIn={createFileIn}
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
              vault={
                vault && isTauri
                  ? {
                      initialized: vault.initialized,
                      unlocked: Boolean(session),
                      entries: vaultEntries,
                      activeId: activeVaultId,
                      expanded: vaultExpanded,
                      onOpen: () => setShowAuth(!session),
                      onLock: () => void lockNow(),
                      onSelect: (entryId) => void selectVaultEntry(entryId),
                      onToggleExpanded: (entryId) =>
                        setVaultExpanded((current) =>
                          current.includes(entryId)
                            ? current.filter((held) => held !== entryId)
                            : [...current, entryId],
                        ),
                      onCreateNote: (parentId) => createVaultItem(parentId, false),
                      onCreateFolder: (parentId) => createVaultItem(parentId, true),
                      onRename: (entryId, name) =>
                        vaultAction(async (handle) => {
                          await renameVaultEntry(handle, entryId, name)
                          await refreshEntries(handle)
                        }),
                      onDelete: (entryId) => {
                        const entry = vaultEntries.find((held) => held.id === entryId)
                        if (entry) setConfirm({ kind: 'vaultEntry', id: entryId, name: entry.name })
                      },
                      onExport: (entryId) => {
                        const entry = vaultEntries.find((held) => held.id === entryId)
                        if (entry) setConfirm({ kind: 'vaultExport', id: entryId, name: entry.name })
                      },
                      onImport: moveIntoVault,
                    }
                  : null
              }
            />
          </div>
          <div className="sidebar-resizer" data-no-drag onMouseDown={startSidebarResize} />
        </>
      )}

      <div className="notebook-main">
        {showAuth && vault ? (
          <VaultAuth
            status={vault}
            onUnlocked={(handle) => void vaultUnlocked(handle)}
            onCancel={() => setShowAuth(false)}
          />
        ) : (
        <NoteEditor
          value={content}
          onChange={(next) => {
            setContent(next)
            setDirty(true)
          }}
          placeholder={text.placeholder}
          assets={assets}
          onSaveImage={saveImage}
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
                title={strings.common.save}
                disabled={status.kind === 'saving'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={manualSave}
              >
                <Save size={14} aria-hidden="true" />
              </button>
            </>
          }
          footerExtra={
            <span className={failed ? 'note-status error' : 'note-status'}>{statusLabel}</span>
          }
        />
        )}
        {!activeNode && !activeVaultId && !showAuth && (
          <p className="notebook-hint">{text.empty}</p>
        )}
      </div>

      {migration && (
        <div className="editor-backdrop">
          <div className="editor-card confirm-card">
            <div className="editor-header">
              <span>{text.migrateTitle}</span>
            </div>
            <p>{text.migrateBody(migration.candidates.length)}</p>
            <ul className="confirm-list">
              {migration.candidates.map((candidate) => (
                <li key={candidate.sourceMarkdown}>
                  {fileNameOf(candidate.sourceMarkdown)} ·{' '}
                  {text.migrateImages(candidate.referencedAssets.length)}
                  {candidate.warnings.map((warning, index) => (
                    <div key={index} className="note-status error">
                      {warning.kind === 'targetExists'
                        ? text.migrateWarnTargetExists
                        : warning.kind === 'sharedAsset'
                          ? text.migrateWarnShared(warning.reference)
                          : warning.kind === 'remoteAsset'
                            ? text.migrateWarnRemote(warning.reference)
                            : text.migrateWarnExternal(warning.reference)}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
            <div className="editor-footer">
              <div className="toolbar-spacer" />
              <button type="button" className="reminder-button" onClick={() => setMigration(null)}>
                {text.migrateLater}
              </button>
              <button
                type="button"
                className="reminder-button primary"
                onClick={() => void runMigration(migration)}
              >
                {text.migrateStart}
              </button>
            </div>
          </div>
        </div>
      )}

      {migrated && (
        <div className="editor-backdrop" onMouseDown={() => setMigrated(null)}>
          <div className="editor-card confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <span>{text.migrateDoneTitle}</span>
            </div>
            <p>
              {text.migrateDoneBody(
                migrated.filter((result) => result.succeeded).length,
                migrated.filter((result) => !result.succeeded).length,
              )}
            </p>
            <ul className="confirm-list">
              {migrated
                .filter((result) => !result.succeeded)
                .map((result) => (
                  <li key={result.sourceMarkdown}>
                    {fileNameOf(result.sourceMarkdown)} · {result.message}
                  </li>
                ))}
            </ul>
            <div className="editor-footer">
              <div className="toolbar-spacer" />
              <button type="button" className="reminder-button" onClick={() => setMigrated(null)}>
                {strings.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="editor-backdrop" onMouseDown={() => setNotice(null)}>
          <div className="editor-card confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <span>{notice.title}</span>
            </div>
            <ul className="confirm-list">
              {notice.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
            <div className="editor-footer">
              <div className="toolbar-spacer" />
              <button type="button" className="reminder-button" onClick={() => setNotice(null)}>
                {strings.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="editor-backdrop" onMouseDown={() => setConfirm(null)}>
          <div className="editor-card confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-header">
              <span>
                {confirm.kind === 'draft'
                  ? text.deleteDraftTitle
                  : confirm.kind === 'folder'
                    ? text.deleteFolderTitle
                    : confirm.kind === 'vaultEntry'
                      ? text.vaultDeleteTitle
                      : confirm.kind === 'vaultExport'
                        ? text.vaultMoveOutTitle
                        : text.deleteFileTitle}
              </span>
            </div>

            {confirm.kind === 'vaultEntry' && <p>{text.vaultDeleteBody(confirm.name)}</p>}
            {confirm.kind === 'vaultExport' && (
              <>
                <p>{text.vaultMoveOutBody(confirm.name)}</p>
                <p className="vault-auth-warning">{text.vaultMoveOutWarning}</p>
              </>
            )}
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
                {strings.common.cancel}
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
                  {strings.common.save}
                </button>
              )}
              <button
                type="button"
                className={
                  confirm.kind === 'vaultExport'
                    ? 'reminder-button primary'
                    : 'reminder-button danger'
                }
                onClick={() => void runDelete(confirm)}
              >
                {confirm.kind === 'draft'
                  ? text.deleteAnyway
                  : confirm.kind === 'vaultExport'
                    ? text.vaultMoveOutAction
                    : strings.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotebookPanel
