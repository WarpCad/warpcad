// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { UserFacingError } from './userError.js'

describe('UserFacingError', () => {
  it('keeps the human message for display and exposes the fixed code', () => {
    const error = new UserFacingError('document.deleteBodies/already-deleted', 'document.deleteBodies: "Lid" has already been deleted')
    expect(error.message).toBe('document.deleteBodies: "Lid" has already been deleted')
    expect(error.code).toBe('document.deleteBodies/already-deleted')
  })

  it('is an Error, named for the scrubber, and caught by instanceof Error', () => {
    const error = new UserFacingError('a/b', 'text')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(UserFacingError)
    expect(error.name).toBe('UserFacingError')
    expect(error.stack).toContain('UserFacingError')
  })
})
