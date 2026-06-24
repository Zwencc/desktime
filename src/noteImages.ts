// Images shown in the editor as images.
//
// A note with a picture in it should read like a note with a picture in it, the
// way a Word document does — not like a line of `![](assets/…)` with the picture
// somewhere else. The decoration therefore *replaces* the image markdown with
// the image itself. Only the display is replaced: the document still holds
// ordinary markdown, and the preview renders it unchanged.
//
// **A StateField, not a ViewPlugin, and this is the whole bug fix.** CodeMirror
// evaluates plugin-provided decorations *after* the viewport has been computed,
// so a plugin is not allowed to produce anything that changes the vertical
// layout — it throws `RangeError("Block decorations may not be specified via
// plugins")` from the content builder. The previous version added a block
// widget from a ViewPlugin, so the very transaction that inserted a pasted
// image threw: the image never appeared, and because the decoration is rebuilt
// on every update, every later keystroke threw in the same place and the editor
// stopped responding altogether. A field's decorations are part of the state
// and exist before layout is computed, which is what makes an image legal here.

import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { RangeSetBuilder, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { resolveAssetSrc } from './markdown'
import type { AssetUrls } from './noteAssets'

// `![alt](path "title")`. The path stops at whitespace and brackets, which is
// what markdown itself requires of an unbracketed path — anything more
// permissive starts matching across the rest of the line.
const IMAGE = /!\[([^\]]*)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g

class ImageWidget extends WidgetType {
  // Plain fields and an explicit assignment rather than constructor parameter
  // properties: `erasableSyntaxOnly` is on, and those are TypeScript syntax
  // that has to be compiled away rather than merely erased.
  readonly src: string
  readonly alt: string
  /** The markdown this stands in for, shown again if the file will not load. */
  readonly source: string

  constructor(src: string, alt: string, source: string) {
    super()
    this.src = src
    this.alt = alt
    this.source = source
  }

  // Two widgets showing the same file from the same markdown are the same
  // widget, and letting CodeMirror reuse the DOM is what stops the image
  // reloading and flickering on every keystroke elsewhere in the note.
  eq(other: ImageWidget) {
    return other.src === this.src && other.source === this.source
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-preview'

    const image = document.createElement('img')
    image.src = this.src
    image.alt = this.alt

    // The line's height is measured before the image has loaded, so without
    // this the text below it sits under the picture until something else forces
    // a remeasure.
    image.addEventListener('load', () => view.requestMeasure())

    // The markdown is hidden while the picture stands in for it, so a file that
    // will not load has to give it back — otherwise a broken path is an empty
    // gap with no way to see, let alone fix, what it says.
    image.addEventListener('error', () => {
      wrap.classList.add('broken')
      wrap.replaceChildren(document.createTextNode(this.source))
    })

    wrap.append(image)
    return wrap
  }

  // Nothing in the widget is interactive, so clicks belong to the editor.
  ignoreEvent() {
    return false
  }
}

function build(state: EditorState, assets: AssetUrls): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()

  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number)
    IMAGE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = IMAGE.exec(line.text)) !== null) {
      const src = resolveAssetSrc(match[2], assets)
      // A path that names no picture in this note — a reference the legacy
      // migration left behind, or one typed by hand. Leaving the markdown
      // visible is the honest answer.
      if (!src) continue

      builder.add(
        line.from + match.index,
        line.from + match.index + match[0].length,
        Decoration.replace({ widget: new ImageWidget(src, match[1], match[0]) }),
      )
    }
  }

  return builder.finish()
}

/**
 * The extension, built for one note's pictures.
 *
 * The map is baked in rather than read from a facet because it changes only
 * when the user switches note or pastes an image, and NoteEditor already
 * reconfigures it through a compartment when that happens — see the `assets`
 * effect there.
 */
export function imagePreviews(assets: AssetUrls): Extension {
  const images = StateField.define<DecorationSet>({
    create: (state) => build(state, assets),
    update: (value, transaction) =>
      transaction.docChanged ? build(transaction.state, assets) : value,
    provide: (field) => EditorView.decorations.from(field),
  })

  return [
    images,
    // Hidden markdown has to behave like the picture it looks like: one
    // Backspace removes the image, and the arrow keys step over it rather than
    // walking through characters that are not on screen.
    EditorView.atomicRanges.of((view) => view.state.field(images, false) ?? Decoration.none),
  ]
}
