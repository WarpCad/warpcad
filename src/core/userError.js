// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * An error whose message is written for the user and may quote document text (a body, part,
 * variable or file name). The message is displayed by the toolbar and the AI tools; error
 * reporting sends only {@link UserFacingError#code}, a fixed string, never the message
 * (`docs/decisions/error-reporting.md`, `TODO/core-082`). Framework-free.
 *
 * @module core/userError
 */

export class UserFacingError extends Error {
  /**
   * @param {string} code A fixed string such as `document.deleteBodies/already-deleted`; never built from document text.
   * @param {string} message The human message, free to quote names.
   */
  constructor(code, message) {
    super(message)
    this.name = 'UserFacingError'
    /** @type {string} */
    this.code = code
  }
}
