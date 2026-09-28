// A localStorage-backed settings store, shared by every window.
//
// This is the shape settings.ts arrived at — one JSON blob per key, a local
// listener set because the `storage` event never fires in the window that wrote
// the value, and a snapshot for `useSyncExternalStore`. The moo clock needs the
// same thing three more times (work schedule, salary, activity config), so the
// mechanics live here instead of being copied.
//
// Each store keeps its own key rather than joining `desktime.settings`: a work
// schedule is edited in one place and read everywhere, and a shared blob would
// make every unrelated setting change re-render the widgets that read it.

export type Store<T extends object> = {
  read: () => T
  save: (value: T) => void
  update: (patch: Partial<T>) => T
  /** Stable string identity for `useSyncExternalStore`. */
  snapshot: () => string
  /**
   * The value a snapshot stands for. Components that memoise on the snapshot
   * need this: deriving from `read()` instead would leave the memo with a
   * dependency React cannot see.
   */
  parse: (snapshot: string) => T
  subscribe: (listener: (value: T) => void) => () => void
}

export function createStore<T extends object>(key: string, defaults: T): Store<T> {
  const listeners = new Set<(value: T) => void>()
  let installed = false

  function parse(raw: string): T {
    try {
      if (!raw) return defaults
      return { ...defaults, ...(JSON.parse(raw) as Partial<T>) }
    } catch {
      return defaults
    }
  }

  function read(): T {
    return parse(localStorage.getItem(key) ?? '')
  }

  function save(value: T) {
    localStorage.setItem(key, JSON.stringify(value))
    listeners.forEach((listener) => listener(value))
  }

  function update(patch: Partial<T>) {
    const next = { ...read(), ...patch }
    save(next)
    return next
  }

  function snapshot() {
    return localStorage.getItem(key) ?? ''
  }

  function subscribe(listener: (value: T) => void) {
    if (!installed) {
      installed = true
      window.addEventListener('storage', (event) => {
        if (event.key !== key) return
        const value = read()
        listeners.forEach((entry) => entry(value))
      })
    }

    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { read, save, update, snapshot, parse, subscribe }
}
