<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The dashed alignment guides a placement drag grows on the nearest existing
 * item (`TODO/ui-013`, `Initial design.md` §7a).
 *
 * Screen-space SVG, like every other viewport overlay — the transform gizmo, the
 * dimension lines, the marquee rectangle (`render-001`'s convention, and
 * CLAUDE.md's "don't introduce a second overlay technology" note). Drawing the
 * guides as three.js line objects in the scene would have been the other
 * candidate and was rejected for the same two reasons those overlays were: it
 * puts a second rendering path in the drag loop, and it makes the guides
 * unassertable by an `*.e2e.js` spec without pixel-picking a WebGL canvas on
 * three engines.
 *
 * Purely visual. `Viewport.vue` owns the drag bookkeeping,
 * `src/core/library.js`'s `updateSnap` decides *which* alignment wins and where
 * the line lies in millimetres, and `src/render/annotate.js`'s
 * `updateSnapGuideAnnotations` projects it — so this component lays out pixels
 * and does no coordinate maths of its own, per CLAUDE.md's "a component doing
 * coordinate math beyond laying out its own pixels is a bug waiting to happen."
 *
 * ## The two kinds, drawn differently on purpose
 *
 * A `center` guide (the ghost's centre line landing on the reference's) and an
 * `edge` guide (a face landing flush against, or touching, one of the
 * reference's) are genuinely different claims about what just happened, so they
 * are dashed differently and the kind rides along on `data-kind` — assertable,
 * rather than a distinction a user has to infer.
 */
defineProps({
  /**
   * Two `SnapGuideAnnotation`s from `src/render/annotate.js` — one per
   * working-plane axis — mutated in place by the viewport's own drag handlers
   * rather than replaced per pointer event.
   */
  guides: { type: Array, required: true },
})

/**
 * The prop, named at its type boundary — see `Gizmo.vue` for why this alias
 * exists rather than a `PropType` annotation.
 *
 * @param {unknown} guides
 * @returns {import('../../render/annotate.js').SnapGuideAnnotation[]}
 */
function asGuides(guides) {
  return /** @type {any} */ (guides)
}
</script>

<template>
  <svg
    class="snap"
    data-testid="snap-guides"
    :data-guide-count="asGuides(guides).filter((guide) => guide.visible).length"
    aria-hidden="true"
  >
    <line
      v-for="guide in asGuides(guides)"
      v-show="guide.visible"
      :key="guide.axis"
      class="snap__guide"
      :class="`snap__guide--${guide.kind}`"
      :data-testid="`snap-guide-${guide.axis.toLowerCase()}`"
      :data-kind="guide.kind"
      :x1="guide.x1"
      :y1="guide.y1"
      :x2="guide.x2"
      :y2="guide.y2"
    />
  </svg>
</template>

<style scoped>
.snap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* Feedback for the very drag it is drawn during: it must never swallow the
     pointer events that move it. Same rule as every other overlay here. */
  pointer-events: none;
}

.snap__guide {
  /* Its own hue, not `--accent` — see the token's own note. Driving the app is
     what settled this: over a selected body the guides were a fourth blue line
     among the gizmo's rings and the Z dimension line, and read as part of them. */
  stroke: var(--snap-guide);
  /* A dark halo under the dash keeps the line legible where it crosses a solid
     rather than only over the grid — the same problem the dimension labels
     solve with `paint-order`, and the reason this is a wider, softer underlay
     drawn by `stroke-linecap` rather than a bare hairline. At phone width the
     canvas is narrow and busy, which is exactly where this matters. */
  stroke-width: 1.5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 2px var(--surface-0));
}

/* A centre-line alignment: the long-dash convention drafting uses for one. */
.snap__guide--center {
  stroke-dasharray: 12 4 2 4;
}

/* A face landing flush against, or touching, another — an even dash. */
.snap__guide--edge {
  stroke-dasharray: 6 4;
}

@media (max-width: 480px) {
  /* Slightly heavier on a phone: the same line at 390px has far less canvas
     around it to read against (`ui-013`'s own small-screen note). */
  .snap__guide {
    stroke-width: 2;
  }
}
</style>
