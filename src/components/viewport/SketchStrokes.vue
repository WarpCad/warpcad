<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The sketch editor's outlines on the sketch plane (`TODO/sketch-001`): every profile in
 * the draft, the live outline being dragged out, and — for Revolve and Helical — the axis.
 *
 * ## Why an SVG overlay and not lines in the scene
 *
 * A thin, bright, single-colour stroke is exactly what an SVG path is, with no material to
 * tune, and the role/state styling (a dashed Hole, an amber open outline, a ghosted
 * inactive slice) is CSS on theme tokens — legible in light and dark without colour alone
 * carrying the meaning. Paths are re-projected from the same orbit state the WebGL frame
 * used (`src/render/annotate.js`'s `updateSketchPath`), so they stay glued to the plane.
 *
 * ## It never takes a pointer event
 *
 * The whole overlay is `pointer-events: none`. ui-020's acceptance drive found what an
 * invisible fat hit-stroke over the canvas does: it swallows the press, so a drag started
 * on a drawn line drew nothing — a dead strip across the viewport. Picking an outline is
 * done in sketch millimetres by `Viewport.vue` (`profileAtPoint`), so the canvas keeps
 * every gesture.
 *
 * ## The snap marker (`TODO/sketch-007`)
 *
 * While a point being placed has snapped onto another outline, a small marker sits on it whose
 * **shape** names what it hit — a square for a corner, a ring for a centre (or a circle's
 * quadrant), a triangle for a midpoint, a cross for a point on an edge, a diamond for the
 * origin — with the word beside it, so the tier never rests on shape alone. On touch it is
 * lifted above the finger with a leader line down to the real point. Like everything here it
 * is `pointer-events: none` (ui-020 finding #1): a press on the marker is a press on the canvas.
 *
 * ## No maths here
 *
 * Every number comes from `Viewport.vue` via `annotate.js`; this file lays out pixels.
 */
import { computed } from 'vue'

const props = defineProps({
  /**
   * One entry per outline in the draft: `{ key, id, sliceIndex, role, closed, open,
   * active, selected, hover, visible, d, badgeX, badgeY }`.
   */
  paths: { type: Array, required: true },
  /** The outline being dragged out right now: `{ visible, d, closed }`. */
  draft: { type: Object, required: true },
  /** The revolve axis for Revolve/Helical: `{ visible, d }`. */
  axis: { type: Object, required: true },
  /**
   * The live Line chain's furniture (`TODO/sketch-006`): `{ visible, lastXPx, lastYPx,
   * firstXPx, firstYPx, showFirst, closeNear, labelXPx, labelYPx, label }`.
   */
  chain: { type: Object, required: true },
  /**
   * The snap marker (`TODO/sketch-007`): `{ visible, xPx, yPx, markerXPx, markerYPx, lifted,
   * kind, label }`. Optional so a story can leave it out.
   */
  snap: { type: Object, default: () => ({ visible: false }) },
})

/** @type {import('vue').ComputedRef<any[]>} */
const list = computed(() => /** @type {any[]} */ (props.paths))
</script>

<template>
  <svg class="sketch" data-testid="sketch-strokes" :data-path-count="paths.length" :data-drafting="draft.visible ? 'true' : 'false'">
    <path v-if="axis.visible" class="sketch__axis" data-testid="sketch-axis" :d="axis.d" />
    <template v-for="path in list" :key="path.key">
      <path
        v-show="path.visible"
        class="sketch__path"
        :class="{
          'sketch__path--hole': path.role === 'hole',
          'sketch__path--open': path.open,
          'sketch__path--ghost': !path.active,
          'sketch__path--selected': path.selected,
          'sketch__path--hover': path.hover && !path.selected,
        }"
        :data-testid="path.active ? `sketch-profile-${path.id}` : `sketch-ghost-${path.sliceIndex}-${path.id}`"
        :data-profile-id="path.id"
        :data-role="path.role"
        :data-closed="path.closed ? 'true' : 'false'"
        :data-selected="path.selected ? 'true' : 'false'"
        :data-hover="path.hover ? 'true' : 'false'"
        :data-slice="path.sliceIndex"
        :d="path.d"
      />
      <text
        v-if="path.visible && path.selected && path.role === 'hole'"
        class="sketch__badge"
        data-testid="sketch-hole-badge"
        :x="path.badgeX"
        :y="path.badgeY"
      >
        hole
      </text>
    </template>
    <path v-show="draft.visible" class="sketch__path sketch__path--draft" data-testid="sketch-draft" :d="draft.d" />
    <template v-if="chain.visible">
      <circle
        v-if="chain.showFirst"
        class="sketch__first"
        :class="{ 'sketch__first--near': chain.closeNear }"
        data-testid="sketch-chain-first"
        :data-close-near="chain.closeNear ? 'true' : 'false'"
        :cx="chain.firstXPx"
        :cy="chain.firstYPx"
        r="6"
      />
      <circle class="sketch__last" data-testid="sketch-chain-last" :cx="chain.lastXPx" :cy="chain.lastYPx" r="4.5" />
      <text v-if="chain.label" class="sketch__badge sketch__length" data-testid="sketch-chain-length" text-anchor="middle" :x="chain.labelXPx" :y="chain.labelYPx">
        {{ chain.label }}
      </text>
    </template>
    <g
      v-if="snap.visible && snap.kind"
      class="sketch__snap"
      data-testid="sketch-snap-marker"
      :data-kind="snap.kind"
      :data-lifted="snap.lifted ? 'true' : 'false'"
      :data-x-px="snap.xPx.toFixed(1)"
      :data-y-px="snap.yPx.toFixed(1)"
    >
      <line v-if="snap.lifted" class="sketch__snap-leader" :x1="snap.xPx" :y1="snap.yPx" :x2="snap.markerXPx" :y2="snap.markerYPx + 7" />
      <g :transform="`translate(${snap.markerXPx} ${snap.markerYPx})`">
        <rect v-if="snap.kind === 'vertex'" class="sketch__snap-shape" x="-5" y="-5" width="10" height="10" />
        <circle v-else-if="snap.kind === 'centre' || snap.kind === 'quadrant'" class="sketch__snap-shape" r="6" />
        <path v-else-if="snap.kind === 'midpoint'" class="sketch__snap-shape" d="M0 -6 L6 5 L-6 5 Z" />
        <path v-else-if="snap.kind === 'edge'" class="sketch__snap-shape" d="M-5 -5 L5 5 M5 -5 L-5 5" />
        <path v-else class="sketch__snap-shape" d="M0 -7 L7 0 L0 7 L-7 0 Z" />
        <text class="sketch__badge sketch__snap-label" data-testid="sketch-snap-label" x="10" y="-8">{{ snap.label }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.sketch {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.sketch__path {
  fill: none;
  stroke: var(--sketch-stroke);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* A Hole is dashed, so Solid vs Hole never rests on colour alone. */
.sketch__path--hole {
  stroke-dasharray: 7 5;
}

/* An open chain is not part of the solid: amber, and the toolbar says so in words. */
.sketch__path--open {
  stroke: var(--warn);
}

/* Inactive slices stay visible as a faint stack, so a wing's ribs read as a whole. */
.sketch__path--ghost {
  stroke-opacity: 0.35;
  stroke-width: 1.25;
}

.sketch__path--selected {
  stroke: var(--accent);
  stroke-width: 2.75;
}

.sketch__path--hover {
  stroke: var(--accent);
  stroke-opacity: 0.7;
  stroke-width: 2.25;
}

.sketch__path--draft {
  stroke-dasharray: 4 4;
  stroke-opacity: 0.9;
}

/* The last fixed vertex: a solid dot, so a person can see where the live segment starts. */
.sketch__last {
  fill: var(--accent);
  stroke: var(--surface-0);
  stroke-width: 1.5;
}

/* The first vertex is a quiet ring until the pointer is close enough to close on it. */
.sketch__first {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.55;
  stroke-width: 1.5;
}

.sketch__first--near {
  stroke-opacity: 1;
  stroke-width: 2.5;
  fill: var(--accent);
  fill-opacity: 0.25;
  animation: sketch-first-pulse 0.9s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes sketch-first-pulse {
  50% {
    transform: scale(1.5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sketch__first--near {
    animation: none;
  }
}

.sketch__snap-shape {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linejoin: round;
  paint-order: stroke;
}

.sketch__snap-leader {
  stroke: var(--accent);
  stroke-width: 1.25;
  stroke-dasharray: 2 3;
}

.sketch__length {
  font-variant-numeric: tabular-nums;
}

.sketch__axis {
  fill: none;
  stroke: var(--text-3);
  stroke-width: 1.25;
  stroke-dasharray: 10 4 2 4;
}

.sketch__badge {
  fill: var(--accent);
  font-size: 11px;
  font-weight: 650;
  paint-order: stroke;
  stroke: var(--surface-0);
  stroke-width: 3;
}
</style>
