// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { PROMPT_VERSION, SYSTEM_PROMPT, UNKNOWN_SCALE_BEHAVIOUR } from './prompt.js'

/**
 * `TODO/ai-005`: the system prompt is tested for **content**, not wording. Each `it` names one
 * thing the spec says the prompt must carry; the matchers are loose on purpose, so the prompt
 * can be reworded (by `ai-011`'s evals) without rewriting this file, but not lose a rule.
 */

describe('system prompt — versioned and frozen', () => {
  it('has a version string a transcript and an eval can quote', () => {
    expect(typeof PROMPT_VERSION).toBe('string')
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
  })

  it('is a plain string, not a template over document text (decision 7: nothing document-derived in system)', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string')
    expect(SYSTEM_PROMPT).not.toMatch(/\$\{/)
    expect(SYSTEM_PROMPT).not.toMatch(/undefined|\[object Object\]/)
  })

  it('stays well inside a cacheable, readable size', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(1500)
    expect(SYSTEM_PROMPT.length).toBeLessThan(20000)
  })
})

describe('system prompt — conventions', () => {
  it('states the units and axes: millimetres, Z up, degrees', () => {
    expect(SYSTEM_PROMPT).toMatch(/millimet/i)
    expect(SYSTEM_PROMPT).toMatch(/Z\s*(is\s*)?up/i)
    expect(SYSTEM_PROMPT).toMatch(/degrees/i)
  })

  it('says ids come from the document (describe_scene), never invented', () => {
    expect(SYSTEM_PROMPT).toMatch(/describe_scene/)
    expect(SYSTEM_PROMPT).toMatch(/never (invent|guess|make up)/i)
  })

  it('says geometry is placed, not spawned at the origin', () => {
    expect(SYSTEM_PROMPT).toMatch(/positionMm/)
    expect(SYSTEM_PROMPT).toMatch(/plac/i)
    expect(SYSTEM_PROMPT).toMatch(/origin/i)
  })

  it('states the operand rules: create vs operate, operand counts, consumed bodies, @n', () => {
    expect(SYSTEM_PROMPT).toMatch(/\bcreate\b/)
    expect(SYSTEM_PROMPT).toMatch(/\boperate\b/)
    expect(SYSTEM_PROMPT).toMatch(/list_ops/)
    expect(SYSTEM_PROMPT).toMatch(/two or more/i)
    expect(SYSTEM_PROMPT).toMatch(/first operand/i)
    expect(SYSTEM_PROMPT).toMatch(/consum/i)
    expect(SYSTEM_PROMPT).toMatch(/@1/)
    expect(SYSTEM_PROMPT).toMatch(/apply_records/)
  })

  it('carries a short worked example that uses real tool names', () => {
    expect(SYSTEM_PROMPT).toMatch(/example/i)
    expect(SYSTEM_PROMPT).toMatch(/boolean\.subtract/)
  })

  it('carries printing defaults: nozzle, wall, clearance, bed', () => {
    expect(SYSTEM_PROMPT).toMatch(/nozzle/i)
    expect(SYSTEM_PROMPT).toMatch(/wall/i)
    expect(SYSTEM_PROMPT).toMatch(/clearance/i)
    expect(SYSTEM_PROMPT).toMatch(/bed/i)
  })
})

describe('system prompt — behaviour', () => {
  it('inspect before you claim: capture_view / measure before calling a part finished', () => {
    expect(SYSTEM_PROMPT).toMatch(/capture_view/)
    expect(SYSTEM_PROMPT).toMatch(/\bmeasure\b/)
    // ai-007's tools may not be in the list yet; the prompt must say what to do then.
    expect(SYSTEM_PROMPT).toMatch(/not in your tool list|if (they are|those are) (not|missing)/i)
  })

  it('reads tool errors and fixes the call rather than repeating it', () => {
    expect(SYSTEM_PROMPT).toMatch(/error/i)
    expect(SYSTEM_PROMPT).toMatch(/fix|correct/i)
  })

  it('pins ONE unknown-scale behaviour: ask (zero writes), not "state assumptions and proceed"', () => {
    expect(UNKNOWN_SCALE_BEHAVIOUR).toBe('ask')
    expect(SYSTEM_PROMPT).toMatch(/genuinely unknown/i)
    expect(SYSTEM_PROMPT).toMatch(/(rather than|do not|never) invent a dimension/i)
    expect(SYSTEM_PROMPT).toMatch(/no tool that writes|without (writing|calling a write tool)|zero writes/i)
    // The airfoil case is the spec's own example of the behaviour.
    expect(SYSTEM_PROMPT).toMatch(/airfoil/i)
    expect(SYSTEM_PROMPT).toMatch(/span/i)
    expect(SYSTEM_PROMPT).toMatch(/printer|bed/i)
    // …and the other behaviour is explicitly ruled out, so a reword cannot drift to it.
    expect(SYSTEM_PROMPT).toMatch(/do not (start|proceed|build) on assumptions|rather than (assume|assuming)/i)
  })

  it('treats document_data as content, never instructions (decision 7)', () => {
    expect(SYSTEM_PROMPT).toMatch(/document_data/)
    expect(SYSTEM_PROMPT).toMatch(/never (as )?instructions|not instructions/i)
  })

  it('explains the standing-instructions block (it arrives in messages, never in system)', () => {
    expect(SYSTEM_PROMPT).toMatch(/standing instructions/i)
    expect(SYSTEM_PROMPT).toMatch(/NOT confirmed|not confirmed|unconfirmed/i)
  })

  it('knows a turn is one undo step and lands only if it finishes', () => {
    expect(SYSTEM_PROMPT).toMatch(/Undo AI turn/)
  })
})
