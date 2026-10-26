<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One of the Align popover's seven position icons (`TODO/ui-086`): a filled block (the moving
 * body, `--role-moving`) placed against an outlined box (the target, `--role-target`).
 *
 * Drawn **horizontally on every row**, − on the left and + on the right, Z included, so the
 * icon matches the popover's direction rule and column header. `position` runs 0–6 in the
 * button order: outside −, inside −, half −, center, half +, inside +, outside +.
 *
 * Against **World origin** (`pointTarget`) the target is a zero-width line at its centre, and
 * the seven positions honestly collapse to three pictures: 0/2/5 put the body's max face on
 * it, 1/4/6 its min face, and centre stays centre — the same grouping `alignToOrigin` has.
 *
 * @module components/viewport/AlignPositionIcon
 */
import { computed } from 'vue'

const props = defineProps({
  /** 0–6, left to right. */
  position: { type: Number, required: true },
  /** True when the target is the World origin, a point rather than a box. */
  pointTarget: { type: Boolean, default: false },
})

/** The target box's x-extent in the 24-unit viewBox, and the moving block's width. */
const TARGET_MIN = 7
const TARGET_MAX = 17
const CENTRE = (TARGET_MIN + TARGET_MAX) / 2
const BLOCK = 6

/**
 * The block's x origin per position, as `[anchor, side]`: which target coordinate it meets
 * and whether the block's `max` (1) or `min` (0) face touches it, or `null` for centred.
 *
 * @type {ReadonlyArray<readonly [number, 0 | 1] | null>}
 */
const ANCHORS = [
  [TARGET_MIN, 1], // outside −: + face on the target's − face
  [TARGET_MIN, 0], // inside −: − faces flush
  [CENTRE, 1], // half −: + face on the centre
  null, // center
  [CENTRE, 0], // half +: − face on the centre
  [TARGET_MAX, 1], // inside +: + faces flush
  [TARGET_MAX, 0], // outside +: − face on the target's + face
]

const geometry = computed(() => {
  const anchor = ANCHORS[props.position] ?? null
  const point = props.pointTarget
  // Against a point, "the target's − face", its centre and its + face are all the one line.
  const meets = anchor === null ? null : point ? CENTRE : anchor[0]
  const blockX = anchor === null || meets === null ? CENTRE - BLOCK / 2 : anchor[1] === 1 ? meets - BLOCK : meets
  return {
    blockX,
    targetX: point ? CENTRE : TARGET_MIN,
    targetWidth: point ? 0 : TARGET_MAX - TARGET_MIN,
  }
})
</script>

<template>
  <svg class="align-position-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <rect
      data-part="target"
      :x="geometry.targetX"
      y="5"
      :width="geometry.targetWidth"
      height="14"
      fill="none"
      stroke="var(--role-target)"
      stroke-width="1.5"
    />
    <rect data-part="moving" :x="geometry.blockX" y="8" :width="BLOCK" height="8" fill="var(--role-moving)" />
  </svg>
</template>

<style scoped>
.align-position-icon {
  display: block;
  pointer-events: none;
}
</style>
