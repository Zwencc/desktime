import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { isTauri } from './env'

let permission: Promise<boolean> | null = null

async function ensurePermission(): Promise<boolean> {
  if (!isTauri) return false
  if (!permission) {
    permission = (async () => {
      try {
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === 'granted'
        return granted
      } catch (error) {
        console.error('Failed to resolve notification permission', error)
        return false
      }
    })()
  }
  return permission
}

/** Sends a desktop notification when running under Tauri and permission is granted. */
export async function notify(title: string, body?: string) {
  if (!(await ensurePermission())) return
  try {
    sendNotification(body ? { title, body } : { title })
  } catch (error) {
    console.error('Failed to send notification', error)
  }
}
