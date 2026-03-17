import { marked } from 'marked'
import DOMPurify from 'dompurify'

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

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

marked.setOptions({ gfm: true, breaks: true })

/** Renders Markdown (plus mixed plain text) to sanitized HTML for the preview pane. */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: URI_REGEXP,
    ADD_ATTR: ['target', 'rel'],
  })
}
