import { invoke } from '@tauri-apps/api/core'

export type ApiErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'INVALID_REQUEST'
  | 'PROTOCOL_MISMATCH'
  | 'CORE_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE'
  | 'REVISION_CONFLICT'
  | 'UNSUPPORTED_NOTE_TYPE'
  | 'INVALID_DTNOTE'
  | 'ARCHIVE_LIMIT_EXCEEDED'
  | 'PATH_TRAVERSAL'
  | 'DUPLICATE_ENTRY'
  | 'MISSING_CONTENT'
  | 'VAULT_LOCKED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIAL_OR_CORRUPT_META'
  | 'CORRUPT_OBJECT'
  | 'UNSUPPORTED_CRYPTO_VERSION'
  | 'NAME_CONFLICT'
  | 'DISK_FULL'
  | 'IO_ERROR'

export type ApiError = { code: ApiErrorCode; message: string }

export class DeskTimeApiError extends Error {
  readonly code: ApiErrorCode

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'DeskTimeApiError'
    this.code = error.code
  }
}

export async function invokeApi<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    if (isApiError(error)) throw new DeskTimeApiError(error)
    throw error
  }
}

function isApiError(error: unknown): error is ApiError {
  if (!error || typeof error !== 'object') return false
  const value = error as Partial<ApiError>
  return typeof value.code === 'string' && typeof value.message === 'string'
}
