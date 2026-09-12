// Optional LLM lines.
//
// This is an enhancement, never a dependency: `requestLine` returns `null` for
// every failure — disabled, rate-limited, no key, network error, malformed
// answer — and the caller keeps whatever the local library gave it. The widget
// must never wait on a network call to have something to say.
//
// The API key is not here. It is written straight through to the backend, which
// keeps it in the app data directory; this module can ask whether one exists but
// cannot read it, so it never enters localStorage or any page state.

import { invoke } from '@tauri-apps/api/core'
import { currentLanguage, languages } from './locales'
import { isTauri } from './env'
import { createStore } from './store'

export type LlmConfig = {
  enabled: boolean
  /** An OpenAI-compatible base, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  model: string
  timeoutMs: number
  /** Whether the salary figures may be included. Off by default. */
  sendSalary: boolean
}

export const defaultLlm: LlmConfig = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  timeoutMs: 8000,
  sendSalary: false,
}

const llmStore = createStore<LlmConfig>('desktime.llm', defaultLlm)
export const readLlm = llmStore.read
export const updateLlm = llmStore.update
export const subscribeLlm = llmStore.subscribe
export const llmSnapshot = llmStore.snapshot

/**
 * The whole payload. It mirrors the backend's `Context` struct, which has no
 * field for an application name, a window title or a schedule entry — so there
 * is nothing to remember to leave out.
 */
export type LlmContext = {
  mood: string
  modifier: string
  loss: number
  slack: number
  intensity: number
  presentMinutes: number
  overtimeMinutes: number
  meetingMinutes: number
  hourly?: number
  wasted?: number
}

/** The language's own name — what a model recognises most reliably. */
function languageName() {
  const id = currentLanguage()
  return languages.find((entry) => entry.id === id)?.locale.language.name ?? ''
}

/** Only ever called on a state change, and at most this often even then. */
const MIN_INTERVAL_MS = 5 * 60 * 1000

let lastRequestAt = 0

export async function setLlmKey(key: string) {
  if (!isTauri) return
  await invoke('set_llm_key', { key })
}

export async function hasLlmKey() {
  if (!isTauri) return false
  return invoke<boolean>('has_llm_key').catch(() => false)
}

/**
 * Asks the endpoint to categorise applications the built-in tables did not
 * recognise.
 *
 * A separate payload from {@link LlmContext} and a separate command, mirroring
 * the two closed types in the backend: the mood line is never told an
 * application name, and this is never told anything about the work day. Both
 * are only ever an executable name and a product name — which program, never
 * what is open in it.
 *
 * Unlike `requestLine` this is user-initiated, so a failure is returned rather
 * than swallowed: the button was pressed and deserves an answer either way.
 */
export async function classifyApps(
  apps: { exe: string; product: string }[],
): Promise<Record<string, string>> {
  const config = readLlm()
  if (!isTauri || !config.baseUrl || !config.model || apps.length === 0) return {}

  const guesses = await invoke<{ exe: string; category: string }[]>('llm_classify', {
    endpoint: {
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
    },
    apps,
  })

  return Object.fromEntries(guesses.map((guess) => [guess.exe, guess.category]))
}

export async function requestLine(context: LlmContext): Promise<string | null> {
  const config = readLlm()
  if (!config.enabled || !isTauri || !config.baseUrl || !config.model) return null

  const now = Date.now()
  if (now - lastRequestAt < MIN_INTERVAL_MS) return null
  // Claimed before the call, not after, so a slow request cannot let a second
  // one through behind it.
  lastRequestAt = now

  const payload = config.sendSalary
    ? context
    : { ...context, hourly: undefined, wasted: undefined }

  // Added at the boundary rather than by every caller: the prompt stays in one
  // language (it is an instruction to a model), but the reply has to come back
  // in whatever the user is reading.
  const withLanguage = { ...payload, language: languageName() }

  try {
    const answer = await invoke<{ line: string }>('llm_line', {
      endpoint: {
        baseUrl: config.baseUrl,
        model: config.model,
        timeoutMs: config.timeoutMs,
      },
      context: withLanguage,
    })
    return answer.line.trim() || null
  } catch {
    // Silent on purpose: a failed enhancement should be invisible, and the
    // local line is already on screen.
    return null
  }
}
