import { invokeApi } from './result'
import type { NoteDocument, NoteInput } from './note'

export type VaultStatus = {
  initialized: boolean
  unlocked: boolean
  apiVersion: number
  /** Empty until the vault exists. Shown by the "forgot password" screen. */
  securityQuestion: string
  /** Copy this whole folder to back the vault up; it holds only ciphertext. */
  folder: string
}

export type VaultSession = { sessionHandle: string }

export type VaultEntry = {
  id: string
  parentId: string | null
  kind: 'folder' | 'note' | 'backup'
  name: string
  fileId: string | null
  revision: number
}

export type VaultCreateRequest = {
  password: string
  passwordConfirmation: string
  securityQuestion: string
  securityAnswer: string
  securityAnswerConfirmation: string
}

export type VaultDocument = { entry: VaultEntry; document: NoteDocument }
export type VaultImportResult = { entry: VaultEntry; sourceRemoved: boolean }

export function vaultStatus() {
  return invokeApi<VaultStatus>('vault_status')
}

export function createVault(request: VaultCreateRequest) {
  return invokeApi<VaultSession>('vault_create', { request })
}

export function unlockVaultWithPassword(credential: string) {
  return invokeApi<VaultSession>('vault_unlock_password', { request: { credential } })
}

export function unlockVaultWithRecovery(credential: string) {
  return invokeApi<VaultSession>('vault_unlock_recovery', { request: { credential } })
}

export function lockVault(sessionHandle: string) {
  return invokeApi<void>('vault_lock', { sessionHandle })
}

export function listVault(sessionHandle: string) {
  return invokeApi<VaultEntry[]>('vault_list', { sessionHandle })
}

export function readVaultNote(sessionHandle: string, entryId: string) {
  return invokeApi<VaultDocument>('vault_read', { request: { sessionHandle, entryId } })
}

export function writeVaultNote(
  sessionHandle: string,
  entryId: string,
  expectedRevision: number,
  document: NoteInput,
) {
  return invokeApi<VaultEntry>('vault_write', {
    request: { sessionHandle, entryId, expectedRevision, document },
  })
}

/**
 * The encrypted equivalent of the backup draft an ordinary failed save writes.
 *
 * Without it a note that failed to save would have its text parked in a plain
 * file — which is to say, one failed write would put a private note on disk in
 * the clear.
 */
export function writeVaultBackup(sessionHandle: string, entryId: string, document: NoteInput) {
  return invokeApi<VaultEntry>('vault_write_backup', {
    request: { sessionHandle, entryId, expectedRevision: 0, document },
  })
}

export function resetVaultPassword(
  sessionHandle: string,
  newPassword: string,
  newPasswordConfirmation: string,
) {
  return invokeApi<void>('vault_reset_password', {
    request: { sessionHandle, newPassword, newPasswordConfirmation },
  })
}

export function createVaultFolder(sessionHandle: string, parentId: string | null, name: string) {
  return invokeApi<VaultEntry>('vault_create_folder', {
    request: { sessionHandle, parentId, name },
  })
}

export function createVaultNote(sessionHandle: string, parentId: string | null, name: string) {
  return invokeApi<VaultEntry>('vault_create_note', { request: { sessionHandle, parentId, name } })
}

export function renameVaultEntry(sessionHandle: string, entryId: string, name: string) {
  return invokeApi<VaultEntry>('vault_rename', { request: { sessionHandle, entryId, name } })
}

export function moveVaultEntry(
  sessionHandle: string,
  entryId: string,
  parentId: string | null,
  beforeId: string | null,
) {
  return invokeApi<VaultEntry>('vault_move', {
    request: { sessionHandle, entryId, parentId, beforeId },
  })
}

export function deleteVaultEntry(sessionHandle: string, entryId: string) {
  return invokeApi<void>('vault_delete', { request: { sessionHandle, entryId } })
}

/** Moves one plaintext note in. The original is unlinked, never recycled. */
export function importIntoVault(
  sessionHandle: string,
  source: string,
  targetParentId: string | null,
) {
  return invokeApi<VaultImportResult>('vault_import', {
    request: { sessionHandle, source, targetParentId },
  })
}

/** The only way back out, and the only way a private note becomes readable. */
export function exportFromVault(
  sessionHandle: string,
  entryId: string,
  destination: string,
  confirmedPlaintext: boolean,
) {
  return invokeApi<void>('vault_export', {
    request: { sessionHandle, entryId, destination, confirmedPlaintext },
  })
}
