import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { emptyAssets, type AssetUrls } from './noteAssets'

// Permit data: URIs through the URI filter so inline base64 images survive; the
// hook below then drops every data: URI that is not an inline image.
const URI_REGEXP =
  /^(?:(?:https?|ftp|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  const value = (data.attrValue || '').trim().toLowerCase()
  if (!value.startsWith('data:')) return
  const inlineImage =
    node.nodeName === 'IMG' &&
    data.attrName === 'src' &&
    value.startsWith('data:image/')
  if (!inlineImage) data.keepAttr = false
})

/**
 * The pictures of the note being rendered.
 *
 * A module-level variable rather than a parameter because DOMPurify's hooks are
 * global. Rendering is synchronous from the assignment in `renderMarkdown` to
 * the end of `sanitize`, so nothing can interleave with it.
 */
let assets: AssetUrls = emptyAssets

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }

  if (node.nodeName === 'IMG') {
    const source = node.getAttribute('src') ?? ''
    const resolved = resolveAssetSrc(source, assets)
    if (resolved && resolved !== source) node.setAttribute('src', resolved)
  }
})

/**
 * The URL a markdown image path has to become before the webview will show it.
 *
 * A note's pictures live inside the note, so the path in the markdown is not a
 * path to anything on disk — it is the name of an entry in the container, and
 * the bytes behind it arrived with the note as a blob URL. There is no longer a
 * folder involved, and the webview has no way to read a file even if there were.
 *
 * Anything carrying a scheme (`http:`, `data:`) is loadable as it stands and
 * comes back unchanged. `null` means there is nothing to show, which leaves the
 * markdown itself visible rather than an empty gap.
 *
 * The path is percent-decoded before the lookup: `assets/my%20shot.png` in a
 * migrated note means the entry called `assets/my shot.png`.
 *
 * Exported because the editor needs the same answer for its inline previews
 * (see noteImages.ts), and two copies of this rule would drift.
 */
export function resolveAssetSrc(source: string, urls: AssetUrls): string | null {
  if (!source) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return source

  return urls.get(decodePath(source)) ?? urls.get(source) ?? null
}

function decodePath(source: string) {
  try {
    return decodeURIComponent(source)
  } catch {
    // A stray `%` is not an encoding; the raw text is the best guess left.
    return source
  }
}

marked.setOptions({ gfm: true, breaks: true })

/**
 * Renders Markdown (plus mixed plain text) to sanitized HTML for the preview.
 *
 * `urls` are the open note's pictures; without them image paths are left alone,
 * which is right for anything that is not a note.
 */
export function renderMarkdown(source: string, urls: AssetUrls = emptyAssets): string {
  assets = urls
  try {
    const html = marked.parse(source, { async: false }) as string
    return DOMPurify.sanitize(html, {
      ALLOWED_URI_REGEXP: URI_REGEXP,
      ADD_ATTR: ['target', 'rel'],
    })
  } finally {
    assets = emptyAssets
  }
}
