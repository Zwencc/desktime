// Fuzzy matching for the launcher.
//
// Two ways of matching, because they answer different intents:
//
//   * **Initials** — `vsc` should find "Visual Studio Code". This is how people
//     actually search for an app they already know.
//   * **Subsequence** — `vscode` should find it too, and `note` should find
//     "Notepad". Characters in order, gaps allowed.
//
// Scoring favours initials, then earlier and tighter matches, then desktop items
// over Start Menu ones, on the grounds that anything a user put on their desktop
// is something they open often.

import type { ShellEntry } from './desktop'

export type Match = {
  entry: ShellEntry
  score: number
}

function initials(name: string) {
  return name
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toLowerCase()
}

/** Position of each matched character, or null when the query does not fit. */
function subsequence(haystack: string, needle: string) {
  const positions: number[] = []
  let cursor = 0

  for (const character of needle) {
    const found = haystack.indexOf(character, cursor)
    if (found < 0) return null
    positions.push(found)
    cursor = found + 1
  }
  return positions
}

function scoreOf(entry: ShellEntry, query: string) {
  const name = entry.name.toLowerCase()

  // An exact prefix is what the user almost certainly meant.
  if (name.startsWith(query)) return 1000 - name.length
  if (initials(entry.name).startsWith(query)) return 800 - name.length

  const positions = subsequence(name, query)
  if (!positions) return -1

  // Reward matches that start early and stay close together.
  const spread = positions[positions.length - 1] - positions[0]
  return 500 - positions[0] * 4 - spread * 2 - name.length / 4
}

export function search(entries: ShellEntry[], raw: string, limit = 9): Match[] {
  const query = raw.trim().toLowerCase()
  if (!query) {
    return entries
      .filter((entry) => entry.source === 'desktop')
      .slice(0, limit)
      .map((entry) => ({ entry, score: 0 }))
  }

  return entries
    .map((entry) => ({ entry, score: scoreOf(entry, query) }))
    .filter((match) => match.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.entry.source === 'desktop') - Number(a.entry.source === 'desktop') ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, limit)
}
