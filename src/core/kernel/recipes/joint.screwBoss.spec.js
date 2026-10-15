// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { JOINT_WALL_MM } from './joint.common.js'
import {
  SCREW_BOSS_WALL_MM,
  SCREW_MAX_MM,
  SCREW_MIN_MM,
  screwBossSizing,
} from './joint.screwBoss.js'

describe('screwBossSizing — a boss for a self-tapping screw or a heat-set insert', () => {
  it('a boss wall thicker than a pin socket’s: it carries a load cycled many times', () => {
    expect(SCREW_BOSS_WALL_MM).toBeGreaterThan(JOINT_WALL_MM)
    expect(SCREW_BOSS_WALL_MM).toBe(2)
    expect([SCREW_MIN_MM, SCREW_MAX_MM]).toEqual([2, 6])
  })

  it('M3 self-tapping: a 3.4 mm clearance bore in A, a 2.4 mm pilot in B, a Ø7.4 boss 4.5 mm proud', () => {
    const sizing = screwBossSizing(3)
    expect(sizing.clearanceBoreMm).toBeCloseTo(3.4, 12)
    expect(sizing.boreMm).toBeCloseTo(2.4, 12)
    expect(sizing.bossMm).toBeCloseTo(7.4, 12)
    expect(sizing.heightMm).toBeCloseTo(4.5, 12)
    expect(sizing.engageMm).toBeCloseTo(7.5, 12)
    expect(sizing.insert).toBe(false)
  })

  it('M3 into a 4 mm heat-set insert: B’s bore is the insert’s, and the boss grows around it', () => {
    const sizing = screwBossSizing(3, 4)
    expect(sizing.clearanceBoreMm).toBeCloseTo(3.4, 12)
    expect(sizing.boreMm).toBeCloseTo(4, 12)
    expect(sizing.bossMm).toBeCloseTo(8, 12)
    expect(sizing.insert).toBe(true)
  })

  it('the boss height clamps to 3–8 mm at the ends of the screw range', () => {
    expect(screwBossSizing(2).heightMm).toBeCloseTo(3, 12)
    expect(screwBossSizing(6).heightMm).toBeCloseTo(8, 12)
  })
})
