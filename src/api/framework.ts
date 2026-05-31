import { invokeApi } from './result'

export type FeatureId =
  | 'core-ipc'
  | 'core-storage'
  | 'note-container'
  | 'vault'
  | 'browser-widget'

export type FeatureStatus = {
  feature: FeatureId
  state: 'scaffolded' | 'ready' | 'degraded'
  apiVersion: number
  owner: string
  nextModule: string
}

export function frameworkStatus() {
  return invokeApi<FeatureStatus[]>('framework_status')
}
