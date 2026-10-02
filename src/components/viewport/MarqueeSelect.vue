<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The marquee (drag-box) select rectangle overlay (`TODO/ui-024`).
 *
 * A translucent rectangle that follows the pointer while a marquee drag is in
 * progress, drawn the same screen-space SVG way as the transform gizmo and
 * the dimension lines (`render-001`'s overlay convention, and CLAUDE.md's
 * "don't introduce a second overlay technology" note) — which is also what
 * makes it assertable by an `*.e2e.js` spec on all three engines without
 * pixel-picking the WebGL canvas underneath it.
 *
 * Purely visual, like `Gizmo.vue` and `DimensionLines.vue`: `Viewport.vue`
 * owns the drag bookkeeping and the body-vs-rectangle intersection test
 * (`src/render/annotate.js`'s `updateMarqueeRect`/`marqueeIntersectsBox`).
 * This component only lays out the pixels those already computed — no
 * coordinate maths of its own, per CLAUDE.md's "a component doing coordinate
 * math beyond laying out its own pixels is a bug waiting to happen."
 */
defineProps({
  /**
   * A `MarqueeRect` from `src/render/annotate.js`, mutated in place by the
   * viewport's own pointer handlers rather than replaced per frame.
   */
  rect: { type: Object, required: true },
})
</script>

<template>
  <svg v-if="rect.visible" class="marquee" data-testid="selection-marquee" aria-hidden="true">
    <rect
      class="marquee__rect"
      :x="rect.x"
      :y="rect.y"
      :width="rect.width"
      :height="rect.height"
    />
  </svg>
</template>

<style scoped>
.marquee {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* Never swallows the pointer that is dragging it — same rule as the gizmo's
     own SVG surface, for the same reason: this sits directly over the canvas
     that is still receiving the very drag it is drawing. */
  pointer-events: none;
}

.marquee__rect {
  fill: color-mix(in srgb, var(--accent) 18%, transparent);
  stroke: var(--accent);
  stroke-width: 1.25;
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}
</style>
