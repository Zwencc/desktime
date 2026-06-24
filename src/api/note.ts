import { invokeApi } from './result'

export type NoteAsset = { path: string; base64: string }
export type NoteDocument = { markdown: string; assets: NoteAsset[] }

/**
 * A picture on its way into a container.
 *
 * `base64: null` means "keep what is already stored under this path". The
 * editor holds blob URLs rather than bytes once a note is open, so a save
 * carries only what was pasted since the last one — an autosave every ten
 * seconds that shipped every screenshot in the note back across the boundary
 * would be unusable long before the note got big.
 */
export type NoteAssetInput = { path: string; base64: string | null }
export type NoteInput = { markdown: string; assets: NoteAssetInput[] }

export function openNote(path: string) {
  return invokeApi<NoteDocument>('note_open', { request: { path } })
}

export function saveNote(path: string, document: NoteInput) {
  return invokeApi<void>('note_save', { request: { path, document } })
}

export function createNote(path: string) {
  return invokeApi<void>('note_create', { request: { path } })
}

/** "Save as", and what promoting a draft became: a note is one file to move. */
export function relocateNote(from: string, to: string, keepSource: boolean) {
  return invokeApi<void>('note_relocate', { request: { from, to, keepSource } })
}

export function readDraft(id: string) {
  return invokeApi<NoteDocument>('draft_read', { id })
}

export function writeDraft(id: string, document: NoteInput) {
  return invokeApi<void>('draft_write', { id, document })
}

export function deleteDraft(id: string) {
  return invokeApi<void>('draft_delete', { id })
}

export function draftsDirectory() {
  return invokeApi<string>('drafts_directory')
}

// —— The one-off legacy migration ——

export type MigrationWarning =
  | { kind: 'externalAsset'; reference: string }
  | { kind: 'sharedAsset'; reference: string }
  | { kind: 'remoteAsset'; reference: string }
  | { kind: 'targetExists' }

export type LegacyNoteCandidate = {
  sourceMarkdown: string
  targetDtnote: string
  referencedAssets: string[]
  warnings: MigrationWarning[]
}

export type MigrationPlan = { planId: string; candidates: LegacyNoteCandidate[] }

export type MigrationResult = {
  sourceMarkdown: string
  targetDtnote: string | null
  succeeded: boolean
  message: string
}

/** Reads only. Nothing on disk changes until the plan comes back approved. */
export function scanLegacyNotes(paths: string[]) {
  return invokeApi<MigrationPlan>('note_migration_scan', { paths })
}

export function executeLegacyMigration(planId: string) {
  return invokeApi<MigrationResult[]>('note_migration_execute', { planId })
}
