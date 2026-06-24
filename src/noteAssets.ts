// The pictures in the note that is open, as URLs the webview can show.
//
// A note carries its images inside it now, so there is no path for an `<img>`
// to point at — the bytes arrive with the note and become blob URLs here. The
// browser keeps the data behind those URLs alive until they are revoked, which
// makes releasing them on every note switch a correctness requirement rather
// than tidiness: a screenshot-heavy notebook browsed for an afternoon would
// otherwise hold every picture of every note ever opened.

import type { NoteAsset } from './api/note'

/** Container path (`assets/1.png`) to blob URL, for the open note. */
export type AssetUrls = ReadonlyMap<string, string>

export const emptyAssets: AssetUrls = new Map()

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
}

export function toBlobUrls(assets: NoteAsset[]): Map<string, string> {
  const urls = new Map<string, string>()
  for (const asset of assets) {
    urls.set(asset.path, URL.createObjectURL(toBlob(asset.base64, mimeTypeOf(asset.path))))
  }
  return urls
}

export function revokeAll(urls: AssetUrls) {
  urls.forEach((url) => URL.revokeObjectURL(url))
}

function mimeTypeOf(path: string) {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

/**
 * base64 to a Blob, in one pass.
 *
 * `atob` gives a string of char codes; there is no built-in that turns one into
 * bytes, and `Uint8Array.from(binary, c => c.charCodeAt(0))` allocates a closure
 * call per byte. The loop is the boring version and the fast one.
 */
function toBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

/**
 * The path a newly pasted picture gets inside the container.
 *
 * Numbered rather than named after the file it came from, which is what the
 * container layout in the spec shows and what removes a whole class of problem:
 * a clipboard file called `屏幕截图 2024-01-01.png` is not a working markdown
 * link, and folding it into one that is meant a naming rule the editor and the
 * backend both had to agree on. A number and an extension need no rule. The
 * original name is not lost — it goes in the alt text.
 */
export function nextAssetPath(existing: Iterable<string>, fileName: string) {
  let highest = 0
  for (const path of existing) {
    const match = /^assets\/(\d+)\./.exec(path)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `assets/${highest + 1}${extensionOf(fileName)}`
}

function extensionOf(fileName: string) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName)
  return match ? `.${match[1].toLowerCase()}` : '.png'
}
