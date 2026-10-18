// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the **Browser agents** chip says, and the diagnostic an agent can read (`TODO/ai-024`).
 * Framework-free: the chat store hands in a {@link WebMcpStatus}, built from what the link
 * (`register.js`) reported.
 *
 * The rule this module exists for: **"on" never means "on, with nothing registered".** The chip
 * either counts the tools it offers or says why it offers none — the switch is off, the tab is
 * hidden (tools are offered only from the visible tab), or the browser refused them.
 *
 * The diagnostic is one line, side-effect free to read:
 * `api=document|navigator|none; enabled=on|off; visible=yes|no; registered=N; failed=[names]`.
 * The app puts it on the chip (`data-webmcp`), in `<meta name="warpcad-webmcp">` and in one
 * `console.info` per change (`composables/useWebMcp.js`).
 *
 * @module ai/webmcp/status
 */

/**
 * @typedef {object} WebMcpStatus
 * @property {'document' | 'navigator' | 'none'} api Where the entry point was found (`toolShape.modelContextApiOf`).
 * @property {boolean} enabled The **Browser agents** switch is on.
 * @property {boolean} visible The tab is visible (tools are registered only then).
 * @property {number} registered How many tools are registered right now.
 * @property {readonly { name: string, message: string }[]} failed What the current registration refused.
 */

/** @typedef {'unavailable' | 'off' | 'hidden' | 'registering' | 'failed' | 'partial' | 'registered'} WebMcpReason */

/**
 * Why the tools are, or are not, registered — in the order that decides it.
 *
 * @param {WebMcpStatus} status
 * @returns {WebMcpReason}
 */
export function webMcpReasonOf(status) {
  if (status.api === 'none') return 'unavailable'
  if (!status.enabled) return 'off'
  if (!status.visible) return 'hidden'
  if (status.registered === 0 && status.failed.length === 0) return 'registering'
  if (status.registered === 0) return 'failed'
  if (status.failed.length > 0) return 'partial'
  return 'registered'
}

/** @param {number} count */
const tools = (count) => `${count} ${count === 1 ? 'tool' : 'tools'}`

/**
 * The chip's words. Empty where the browser has no WebMCP (there is no chip).
 *
 * @param {WebMcpStatus} status
 * @returns {string}
 */
export function webMcpChipLabel(status) {
  switch (webMcpReasonOf(status)) {
    case 'unavailable':
      return ''
    case 'off':
      return 'Browser agents · off'
    case 'hidden':
      return 'Browser agents · on, but the tab is hidden'
    case 'registering':
      return 'Browser agents · on — registering…'
    case 'failed':
      return 'Browser agents · on — registration failed'
    case 'partial':
      return `Browser agents · on — ${tools(status.registered)}, ${status.failed.length} refused`
    default:
      return `Browser agents · on — ${tools(status.registered)}`
  }
}

/**
 * The one-line diagnostic. With no API, `enabled=off` (nothing can be on).
 *
 * @param {WebMcpStatus} status
 * @returns {string}
 */
export function webMcpDiagnostic(status) {
  const enabled = status.api !== 'none' && status.enabled ? 'on' : 'off'
  const failed = status.failed.map((failure) => failure.name).join(',')
  return `api=${status.api}; enabled=${enabled}; visible=${status.visible ? 'yes' : 'no'}; registered=${status.registered}; failed=[${failed}]`
}

/**
 * The sentence under the Assistant header when the browser refused some or all of the tools, or
 * `''`. Only while tools are meant to be offered: off or hidden, nothing was refused.
 *
 * @param {WebMcpStatus} status
 * @returns {string}
 */
export function webMcpFailureText(status) {
  const reason = webMcpReasonOf(status)
  if (reason === 'partial') {
    const names = status.failed.map((failure) => failure.name).join(', ')
    return `Another tab or page already offers ${names}; this tab could not register ${status.failed.length === 1 ? 'it' : 'them'}.`
  }
  if (reason === 'failed') {
    return `The browser refused all ${status.failed.length} of WarpCad’s tools (first reason: ${status.failed[0].message}). If another WarpCad tab is open, close it, or switch to it and back.`
  }
  return ''
}
