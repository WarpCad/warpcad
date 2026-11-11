// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Cleans a Help page fragment before `HelpSheet.vue` renders it with `v-html` (`TODO/ui-119`). In
 * the native app the fragment arrives from `app.warpcad.com`, inside the web view that holds the
 * user's API key and tokens, so whatever answers there is not trusted. The web build runs the same
 * code path, so both are tested by one set of cases.
 *
 * The fragment is parsed with `DOMParser` into an inert document (no script runs, no picture loads)
 * and rebuilt, element by element, from an allow-list that matches what `scripts/help-build.mjs`
 * emits. Anything else is dropped: unknown elements are unwrapped (their text stays), and the
 * elements in {@link DROP_WITH_CHILDREN} go with everything inside them. No dependency.
 *
 * @module help/sanitize
 */

/** The elements the help build emits. */
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'strong', 'em', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'picture', 'source', 'span', 'br', 'hr',
  // A table's scrolling wrapper, `<div class="help-table">`.
  'div',
])

/** Dropped together with their contents, never unwrapped. */
const DROP_WITH_CHILDREN = new Set(['script', 'style', 'iframe', 'object', 'form', 'meta', 'base', 'link'])

/** Attributes kept as they are on any allowed element. `href`, `src`, `srcset`, `target` and `rel` are checked separately. */
const PLAIN_ATTRIBUTES = new Set(['alt', 'id', 'class', 'data-help-page', 'data-help-anchor', 'media'])

/** An in-app link to a help page (`#/help/<slug>`). */
const HELP_LINK_RE = /^#\/help\/[\w-]+$/
/** A picture path under the help folder: no scheme, no `..`, no query. */
const PICTURE_PATH_RE = /^[\w-]+(?:\.[\w-]+)*(?:\/[\w-]+(?:\.[\w-]+)*)*$/

/**
 * @typedef {object} SanitizeOptions
 * @property {string} imgBase the URL prefix every picture must start with: `helpUrl('img/')`
 */

/**
 * True when `href` is a link the sheet may render: an in-app help link, or an `https:` URL.
 *
 * @param {string} href
 * @returns {'help' | 'https' | null}
 */
function linkKind(href) {
  if (HELP_LINK_RE.test(href)) return 'help'
  if (!/^https:\/\//i.test(href)) return null
  try {
    return new URL(href).protocol === 'https:' ? 'https' : null
  } catch {
    return null
  }
}

/**
 * True when `url` is a picture under the help folder.
 *
 * @param {string} url
 * @param {string} imgBase
 * @returns {boolean}
 */
function isHelpPicture(url, imgBase) {
  return imgBase !== '' && url.startsWith(imgBase) && PICTURE_PATH_RE.test(url.slice(imgBase.length))
}

/**
 * True when every candidate in a `srcset` is a picture under the help folder.
 *
 * @param {string} srcset
 * @param {string} imgBase
 * @returns {boolean}
 */
function isHelpSrcset(srcset, imgBase) {
  const candidates = srcset.split(',').map((part) => part.trim())
  if (candidates.length === 0 || candidates.some((part) => part === '')) return false
  return candidates.every((part) => {
    const [url, ...descriptor] = part.split(/\s+/)
    return isHelpPicture(url, imgBase) && descriptor.every((d) => /^\d+(?:\.\d+)?[wx]$/.test(d))
  })
}

/**
 * Copy the allowed attributes of `from` onto `to`. Returns false when the element is pointless
 * without an attribute that was refused (an `<img>` whose `src` is off the help folder, a
 * `<source>` whose `srcset` is), so the caller drops it.
 *
 * @param {Element} from
 * @param {Element} to
 * @param {SanitizeOptions} options
 * @returns {boolean}
 */
function copyAttributes(from, to, { imgBase }) {
  const tag = to.localName
  /** @type {'help' | 'https' | null} */
  let link = null
  for (const { name, value } of Array.from(from.attributes)) {
    if (PLAIN_ATTRIBUTES.has(name)) to.setAttribute(name, value)
    else if (name === 'loading' && tag === 'img' && (value === 'lazy' || value === 'eager')) to.setAttribute(name, value)
    else if (name === 'href' && tag === 'a') {
      link = linkKind(value)
      if (link !== null) to.setAttribute(name, value)
    } else if (name === 'target' && tag === 'a' && value === '_blank') to.setAttribute(name, value)
    else if (name === 'rel' && tag === 'a') to.setAttribute(name, 'noopener noreferrer')
    else if (name === 'src' && tag === 'img' && isHelpPicture(value, imgBase)) to.setAttribute(name, value)
    else if (name === 'srcset' && tag === 'source' && isHelpSrcset(value, imgBase)) to.setAttribute(name, value)
  }
  if (tag === 'a') {
    if (link === 'https') to.setAttribute('rel', 'noopener noreferrer')
    else to.removeAttribute('rel')
    if (link !== 'https') to.removeAttribute('target')
  }
  if (tag === 'img' && !to.hasAttribute('src')) return false
  if (tag === 'source' && !to.hasAttribute('srcset')) return false
  return true
}

/**
 * Rebuild `from`'s children under `into`, in `doc`, keeping only what the allow-list names.
 *
 * @param {Node} from
 * @param {Node} into
 * @param {Document} doc
 * @param {SanitizeOptions} options
 */
function rebuild(from, into, doc, options) {
  for (const node of Array.from(from.childNodes)) {
    if (node.nodeType === 3) {
      into.appendChild(doc.createTextNode(/** @type {Text} */ (node).data))
      continue
    }
    if (node.nodeType !== 1) continue // comments, processing instructions
    const element = /** @type {Element} */ (node)
    const tag = element.localName
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || DROP_WITH_CHILDREN.has(tag)) continue
    if (!ALLOWED_TAGS.has(tag)) {
      rebuild(element, into, doc, options)
      continue
    }
    const copy = doc.createElement(tag)
    if (!copyAttributes(element, copy, options)) continue
    rebuild(element, copy, doc, options)
    into.appendChild(copy)
  }
}

/**
 * The fragment, rebuilt from the allow-list, as HTML for `v-html`.
 *
 * @param {string} html a Help page fragment, its pictures already pointed at the help folder
 * @param {SanitizeOptions} options
 * @returns {string}
 */
export function sanitizeHelpHtml(html, options) {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html')
  const out = document.implementation.createHTMLDocument('')
  const root = out.createElement('div')
  rebuild(parsed.body, root, out, options)
  return root.innerHTML
}
