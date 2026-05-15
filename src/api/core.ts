import { invokeApi } from './result'

export type CoreMethod =
  | 'ping'
  | 'status'
  | 'activityQuery'
  | 'activityConfigUpdate'
  | 'activityClear'
  | 'activityAppNames'
  | 'activityDebug'
  | 'scheduleList'
  | 'scheduleUpsert'
  | 'scheduleDelete'
  | 'reminderList'
  | 'reminderUpsert'
  | 'reminderDelete'
  | 'subscribe'
  | 'cancelTask'
  | 'shutdown'

export function coreRequest<T>(method: CoreMethod, payload: unknown = null): Promise<T> {
  return invokeApi<T>('core_request', {
    requestId: requestId(),
    method,
    payload,
  })
}

function requestId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
