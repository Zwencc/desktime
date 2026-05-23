import { invokeApi } from './result'

export type BackgroundStatus = {
  serviceInstalled: boolean
  serviceRunning: boolean
  degraded: boolean
}

export function backgroundStatus() {
  return invokeApi<BackgroundStatus>('background_status')
}

export function repairBackgroundProtection() {
  return invokeApi<boolean>('repair_background_service')
}
