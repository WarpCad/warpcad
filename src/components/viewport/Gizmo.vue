<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The transform gizmo: three translate arrows and three rotate rings, attached
 * to the selected body's origin, and draggable.
 *
 * `ui-011` drew these handles; `ui-012` made them work. What this component
 * still does *not* do is any arithmetic — it reports which handle a pointer
 * grabbed and where that pointer has got to, and `Viewport.vue` turns that into
 * millimetres and degrees through `src/render/annotate.js`. Same division as the
 * drawing half, for the same reason (CLAUDE.md: a component doing coordinate
 * maths is a bug waiting to happen).
 *
 * ## Hit targets are not the drawn shapes
 *
 * A 3 px arm and a 3 px ring are aimable with a mouse and hopeless with a
 * fingertip, so every handle carries an invisible companion with a fat stroke —
 * fatter still at phone width, per `docs/decisions/interaction-model-qa.md`
 * control 4 Q16 ("a larger invisible hit-test radius than their rendered size, to
 * compensate for finger contact area"). Two consequences are deliberate:
 *
 * - **The SVG stays `pointer-events: none`; only the hit targets opt in.** The
 *   gizmo sits directly over the body the user clicks to select, and a
 *   full-surface overlay would break click-to-select outright — the failure
 *   `ui-011`'s "the overlays never swallow the click that selects" spec guards.
 * - **The arms' hit targets start part-way out**, leaving the hub and the body's
 *   middle clear, and a press that never moves is reported as a **click** for the
 *   viewport to pick with. So grabbing a handle and changing your mind selects
 *   what is underneath rather than doing nothing at all — a dead zone the size of
 *   the gizmo would be its own bug.
 *
 * ## Screen-space SVG, like the rest of the viewport's chrome
 *
 * `render-001` established DOM/SVG overlays for the grid readout and the
 * orientation triad, and CLAUDE.md is explicit about not introducing a second
 * overlay technology alongside them. There is a second reason: an SVG gizmo is
 * assertable by an `*.e2e.js` spec on all three engines without pixel-picking a
 * WebGL canvas, which is what a WebGL-sensitive surface needs coverage for.
 *
 * ## No maths here
 *
 * Every number this draws comes from `src/render/annotate.js`, which is
 * framework-free and unit-tested in plain Node — CLAUDE.md: "a component doing
 * coordinate math beyond laying out its own pixels is a bug waiting to happen."
 * This file lays out pixels.
 */
import { computed } from 'vue'

import RotateDial from './RotateDial.vue'
import {
  AXIS_LABELS,
  GIZMO_SHAFT_WIDTH_PX,
  createRingArrowheads,
  createRingPoints,
  ringArrowheads,
  ringPoints,
} from '../../render/annotate.js'

const props = defineProps({
  /**
   * A `GizmoAnnotation` from `src/render/annotate.js`, mutated in place by the
   * viewport's render callback rather than replaced per frame.
   */
  annotation: { type: Object, required: true },
  /**
   * A `DialAnnotation` from `src/render/annotate.js` (`TODO/ui-064`): the
   * watchface drawn in a rotate ring's plane while that ring is dragged.
   * Mutated in place like `annotation`; `null` or `visible: false` draws nothing.
   */
  dial: { type: Object, default: null },
})

/**
 * The dial prop, typed once, like `gizmo` below.
 *
 * @type {import('vue').ComputedRef<import('../../render/annotate.js').DialAnnotation | null>}
 */
const dialAnnotation = computed(() => /** @type {any} */ (props.dial))

/**
 * The axis whose dial is showing, or `''` when none is. While a rotate drag
 * shows its dial, the other two rings are hidden (`v-show`, so the DOM and its
 * test ids stay put) and only the ring being turned remains.
 *
 * @type {import('vue').ComputedRef<string>}
 */
const dialAxis = computed(() => (dialAnnotation.value?.visible ? dialAnnotation.value.axis : ''))

/**
 * @param {string} axis `"X"` | `"Y"` | `"Z"`.
 * @returns {boolean} False for a ring hidden because another ring's dial is up.
 */
function ringShown(axis) {
  return dialAxis.value === '' || dialAxis.value === axis
}

/**
 * The prop, named at its type boundary. `defineProps` in a plain-JS SFC widens
 * to `Object`, so this is where the shape is stated once instead of every
 * template expression re-asserting it.
 *
 * @type {import('vue').ComputedRef<import('../../render/annotate.js').GizmoAnnotation>}
 */
const gizmo = computed(() => /** @type {any} */ (props.annotation))

/**
 * Axis colours reuse the viewport's own axis tokens, so X is X everywhere.
 * @type {Readonly<Record<string, string>>}
 */
const AXIS_STROKE = Object.freeze({
  X: 'var(--axis-x)',
  Y: 'var(--axis-y)',
  Z: 'var(--accent)',
})

/**
 * Ids of the per-axis shaft `<linearGradient>`s declared in this component's
 * `<defs>` (`TODO/ui-021`, reworked by `TODO/ui-048`) — lit flank, axis colour,
 * shaded flank, running *across* the shaft so it reads as a rod rather than a
 * flat line. Kept as ids rather than inlining the gradient markup at each use
 * site, the same way `AXIS_STROKE` is one lookup table rather than three
 * `arrow.axis === 'X' ? ... : ...` chains everywhere it's read.
 *
 * @type {Readonly<Record<string, string>>}
 */
const AXIS_GRADIENT_ID = Object.freeze({
  X: 'gizmo-shade-x',
  Y: 'gizmo-shade-y',
  Z: 'gizmo-shade-z',
})

/**
 * Same idea for each arrowhead: one gradient per cone, across its base.
 *
 * @type {Readonly<Record<string, string>>}
 */
const AXIS_CONE_GRADIENT_ID = Object.freeze({
  X: 'gizmo-cone-shade-x',
  Y: 'gizmo-cone-shade-y',
  Z: 'gizmo-cone-shade-z',
})

/**
 * Colour stops shared by the shaft and cone gradients: a highlight just in from
 * the lit flank, the axis colour through the middle, and a darker shade on the
 * far flank — how a lit cylinder or cone actually looks, and still obviously
 * red/green/blue.
 *
 * @param {string} axis
 * @returns {{ offset: string, color: string }[]}
 */
function rodStops(axis) {
  const colour = AXIS_STROKE[axis]
  return [
    { offset: '0%', color: `color-mix(in srgb, ${colour} 70%, white 30%)` },
    { offset: '30%', color: `color-mix(in srgb, ${colour} 55%, white 45%)` },
    { offset: '65%', color: colour },
    { offset: '100%', color: `color-mix(in srgb, ${colour} 65%, black 35%)` },
  ]
}

/** Precomputed once — the stops never change, only the gradient lines do. */
const ROD_STOPS = Object.freeze(Object.fromEntries(AXIS_LABELS.map((axis) => [axis, rodStops(axis)])))

/** The cone's base disc: the axis colour in shade, the back of the cone. */
const CONE_BASE_FILL = Object.freeze(
  Object.fromEntries(AXIS_LABELS.map((axis) => [axis, `color-mix(in srgb, ${AXIS_STROKE[axis]} 60%, black 40%)`])),
)

/**
 * Same idea as {@link AXIS_GRADIENT_ID}, a subtler variant for the rings.
 *
 * @type {Readonly<Record<string, string>>}
 */
const AXIS_RING_GRADIENT_ID = Object.freeze({
  X: 'gizmo-ring-shade-x',
  Y: 'gizmo-ring-shade-y',
  Z: 'gizmo-ring-shade-z',
})

/**
 * `url(#id)` reference for an SVG paint attribute (`stroke`/`fill`), built
 * once per lookup rather than re-templated at every call site.
 *
 * @param {string} id
 * @returns {string}
 */
function paintUrl(id) {
  return `url(#${id})`
}

/**
 * Point buffers, allocated once per ring and reused for the life of the
 * component — the projection itself allocates nothing, per CLAUDE.md's
 * Performance rule.
 *
 * The `points` *strings* below are the one thing rebuilt per frame: SVG geometry
 * attributes are strings, so any DOM overlay pays this, and the existing grid
 * readout and orientation triad already do. Three short strings per frame is
 * nursery churn, not the multi-megabyte typed-array traffic that rule is about.
 */
const ringBuffers = [createRingPoints(), createRingPoints(), createRingPoints()]

const ringPaths = computed(() =>
  gizmo.value.rings.map((ring, index) => {
    const points = ringPoints(ring, gizmo.value.originX, gizmo.value.originY, ringBuffers[index])
    let path = ''
    for (const point of points) path += `${point.x.toFixed(2)},${point.y.toFixed(2)} `
    return { axis: ring.axis, points: path.trimEnd() }
  }),
)

/**
 * Two small direction chevrons per ring (`TODO/ui-022`) — the cue that a bare
 * ring otherwise doesn't carry: "drag along me to spin the object," not
 * "decorative circle." Same allocate-once-per-ring, mutate-per-frame buffer
 * convention as `ringBuffers` above.
 */
const ringArrowBuffers = [createRingArrowheads(), createRingArrowheads(), createRingArrowheads()]

const ringArrowPaths = computed(() =>
  gizmo.value.rings.map((ring, index) => {
    const heads = ringArrowheads(ring, gizmo.value.originX, gizmo.value.originY, ringArrowBuffers[index])
    return {
      axis: ring.axis,
      heads: heads.map(
        (head, headIndex) => ({
          key: headIndex,
          points: `${head[0].x.toFixed(2)},${head[0].y.toFixed(2)} ${head[1].x.toFixed(2)},${head[1].y.toFixed(2)} ${head[2].x.toFixed(2)},${head[2].y.toFixed(2)}`,
        }),
      ),
    }
  }),
)

/**
 * Where along an arm its hit target begins, as a fraction of the arm's length.
 * Everything closer in belongs to the hub — and to whatever solid is drawn
 * behind it, which the user still has to be able to click.
 */
const ARM_GRAB_FROM = 0.45

/**
 * Total pointer travel, in pixels, below which a press on a handle is a click
 * rather than a drag. Matches `Viewport.vue`'s own slop: a tap on a touch screen
 * always wanders a pixel or two, and the two must agree or a gesture would count
 * as a drag here and a click there.
 */
const CLICK_SLOP_PX = 5

const emit = defineEmits(['handle-down', 'handle-move', 'handle-up', 'handle-click'])

/** Start points of each arm's hit target — the drawn line, trimmed at the hub end. */
const armGrabs = computed(() =>
  gizmo.value.arrows.map((arrow) => ({
    axis: arrow.axis,
    visible: arrow.visible,
    x1: gizmo.value.originX + (arrow.tipX - gizmo.value.originX) * ARM_GRAB_FROM,
    y1: gizmo.value.originY + (arrow.tipY - gizmo.value.originY) * ARM_GRAB_FROM,
    x2: arrow.tipX,
    y2: arrow.tipY,
  })),
)

/** The drag in progress: which handle, and how far the pointer has wandered. */
let dragPointerId = -1
let dragStartX = 0
let dragStartY = 0
let dragTravelPx = 0

/**
 * @param {PointerEvent} event
 * @param {'translate' | 'rotate'} kind
 * @param {number} axisIndex 0 | 1 | 2.
 */
function onHandleDown(event, kind, axisIndex) {
  // Stop the press reaching the canvas underneath: without this the viewport
  // would start orbiting the camera at the same time as the body moves.
  event.stopPropagation()
  event.preventDefault()
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragTravelPx = 0
  try {
    /** @type {Element} */ (event.currentTarget).setPointerCapture?.(event.pointerId)
  } catch {
    // Capture is an optimisation: without it a drag simply ends when the pointer
    // leaves the handle. It throws outright on pointer ids the browser does not
    // consider active (synthetic events in specs), and must never take the
    // gesture down with it.
  }
  // `pointerType` and `shiftKey` ride along for the rotate dial (`TODO/ui-064`):
  // Shift snaps to 5° steps, and touch/pen use a speed-sensitive step. This
  // component only reports them; `Viewport.vue` decides what they mean.
  emit('handle-down', {
    kind,
    axisIndex,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType || 'mouse',
    shiftKey: event.shiftKey === true,
  })
}

/** @param {PointerEvent} event */
function onHandleMove(event) {
  if (event.pointerId !== dragPointerId) return
  event.stopPropagation()
  dragTravelPx += Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY)
  emit('handle-move', { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey === true })
}

/** @param {PointerEvent} event */
function onHandleUp(event) {
  if (event.pointerId !== dragPointerId) return
  event.stopPropagation()
  try {
    /** @type {Element} */ (event.currentTarget).releasePointerCapture?.(event.pointerId)
  } catch {
    // Same as capture above: cleanup never throws out of a pointer handler.
  }
  dragPointerId = -1
  const travelPx = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY)
  if (travelPx <= CLICK_SLOP_PX && dragTravelPx <= CLICK_SLOP_PX) {
    // Pressed a handle and changed their mind. Hand it back as a click so the
    // viewport picks what is underneath, rather than leaving a gizmo-shaped dead
    // zone over the very solid the gizmo is attached to.
    emit('handle-up', { cancelled: true })
    emit('handle-click', { clientX: event.clientX, clientY: event.clientY })
    return
  }
  emit('handle-up', { cancelled: false })
}
</script>

<template>
  <svg
    v-if="gizmo.visible"
    class="tgizmo"
    data-testid="transform-gizmo"
    :data-origin="`${gizmo.originX.toFixed(1)},${gizmo.originY.toFixed(1)}`"
    aria-hidden="true"
  >
    <!-- Shading gradients. The rings' (TODO/ui-021) use the default
         `objectBoundingBox` units: each ring shades against its own bounds and
         needs no per-frame update. The arms' and cones' cannot (TODO/ui-048):
         a light direction fixed to the shape's bbox cuts a cone at an arbitrary
         diagonal, and a shaft that is exactly vertical or horizontal on screen
         has a zero-extent bbox, which the SVG spec says gets no paint server at
         all. So they are `userSpaceOnUse`, with lines across each arm that
         `annotate.js` recomputes per frame. Only the attributes update; the
         gradient elements themselves are never rebuilt. -->
    <defs>
      <template v-for="arrow in gizmo.arrows" :key="`shade-${arrow.axis}`">
        <linearGradient
          :id="AXIS_GRADIENT_ID[arrow.axis]"
          gradientUnits="userSpaceOnUse"
          :x1="arrow.s1x"
          :y1="arrow.s1y"
          :x2="arrow.s2x"
          :y2="arrow.s2y"
        >
          <stop
            v-for="stop in ROD_STOPS[arrow.axis]"
            :key="stop.offset"
            :offset="stop.offset"
            :stop-color="stop.color"
          />
        </linearGradient>
        <linearGradient
          :id="AXIS_CONE_GRADIENT_ID[arrow.axis]"
          gradientUnits="userSpaceOnUse"
          :x1="arrow.h1x"
          :y1="arrow.h1y"
          :x2="arrow.h2x"
          :y2="arrow.h2y"
        >
          <stop
            v-for="stop in ROD_STOPS[arrow.axis]"
            :key="stop.offset"
            :offset="stop.offset"
            :stop-color="stop.color"
          />
        </linearGradient>
      </template>
      <linearGradient
        v-for="axis in AXIS_LABELS"
        :key="`ring-shade-${axis}`"
        :id="AXIS_RING_GRADIENT_ID[axis]"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="100%"
      >
        <stop offset="0%" :stop-color="`color-mix(in srgb, ${AXIS_STROKE[axis]} 65%, white 35%)`" />
        <stop offset="100%" :stop-color="AXIS_STROKE[axis]" />
      </linearGradient>
    </defs>

    <!-- Rotate rings first, so the translate arrows draw on top of them. Drawn
         as a dim, gradient-shaded band (the "tube wall") plus a thin, brighter
         core of the same axis colour on top (the "tube's near side catching
         the light") — TODO/ui-021's "double-stroke band" option, cheaper than
         new ring geometry since both reuse the same `ringPaths` points. -->
    <polygon
      v-for="ring in ringPaths"
      v-show="ringShown(ring.axis)"
      :key="`ring-${ring.axis}`"
      class="tgizmo__ring"
      :data-testid="`gizmo-ring-${ring.axis.toLowerCase()}`"
      :points="ring.points"
      :stroke="paintUrl(AXIS_RING_GRADIENT_ID[ring.axis])"
    />
    <!-- Deliberately `gizmo-core-ring-*`, not `gizmo-ring-core-*`:
         `selection-inspector.e2e.js`'s own `[data-testid^="gizmo-ring-"]`
         selector expects exactly 3 matches (the band polygons above alone) —
         the same collision `ui-022`'s arrowheads already hit once, see the
         comment above that block. -->
    <polygon
      v-for="ring in ringPaths"
      v-show="ringShown(ring.axis)"
      :key="`ring-core-${ring.axis}`"
      class="tgizmo__ring-core"
      :data-testid="`gizmo-core-ring-${ring.axis.toLowerCase()}`"
      :points="ring.points"
      :stroke="AXIS_STROKE[ring.axis]"
    />

    <!-- Direction chevrons on each ring (TODO/ui-022): the "drag to rotate"
         cue a bare circle doesn't otherwise carry. -->
    <template v-for="ringArrow in ringArrowPaths" :key="`ring-arrows-${ringArrow.axis}`">
      <polygon
        v-for="head in ringArrow.heads"
        v-show="ringShown(ringArrow.axis)"
        :key="`ring-arrow-${ringArrow.axis}-${head.key}`"
        class="tgizmo__ring-arrow"
        :data-testid="`gizmo-rotate-arrow-${ringArrow.axis.toLowerCase()}-${head.key}`"
        :points="head.points"
        :fill="AXIS_STROKE[ringArrow.axis]"
      />
    </template>

    <!-- Arms: a shaded rod with a cone tip (TODO/ui-048). The cone is a
         triangle plus its base disc, foreshortened by how far the arm points
         along the view. An arm pointing toward the camera hides that disc
         behind the cone, so the disc draws first and only its far rim shows.
         An arm pointing away shows the disc face-on, so it draws on top.
         The disc is `gizmo-cone-base-*`, never `gizmo-head-*`/`gizmo-arm-*`:
         e2e specs count matches on those prefixes. -->
    <g v-for="arrow in gizmo.arrows" :key="`arm-${arrow.axis}`">
      <template v-if="arrow.visible">
        <line
          class="tgizmo__arm"
          :data-testid="`gizmo-arm-${arrow.axis.toLowerCase()}`"
          :x1="gizmo.originX"
          :y1="gizmo.originY"
          :x2="arrow.baseX"
          :y2="arrow.baseY"
          :stroke="paintUrl(AXIS_GRADIENT_ID[arrow.axis])"
          :stroke-width="GIZMO_SHAFT_WIDTH_PX"
        />
        <ellipse
          v-if="arrow.facing > 0"
          class="tgizmo__cone-base"
          :data-testid="`gizmo-cone-base-${arrow.axis.toLowerCase()}`"
          :cx="arrow.baseX"
          :cy="arrow.baseY"
          :rx="arrow.coneRx"
          :ry="arrow.coneRy"
          :transform="`rotate(${arrow.coneAngleDeg} ${arrow.baseX} ${arrow.baseY})`"
          :fill="CONE_BASE_FILL[arrow.axis]"
        />
        <polygon
          class="tgizmo__head"
          :data-testid="`gizmo-head-${arrow.axis.toLowerCase()}`"
          :points="`${arrow.tipX},${arrow.tipY} ${arrow.h1x},${arrow.h1y} ${arrow.h2x},${arrow.h2y}`"
          :fill="paintUrl(AXIS_CONE_GRADIENT_ID[arrow.axis])"
        />
        <ellipse
          v-if="arrow.facing < 0"
          class="tgizmo__cone-base"
          :data-testid="`gizmo-cone-base-${arrow.axis.toLowerCase()}`"
          :cx="arrow.baseX"
          :cy="arrow.baseY"
          :rx="arrow.coneRx"
          :ry="arrow.coneRy"
          :transform="`rotate(${arrow.coneAngleDeg} ${arrow.baseX} ${arrow.baseY})`"
          :fill="CONE_BASE_FILL[arrow.axis]"
        />
      </template>
    </g>

    <circle
      class="tgizmo__hub"
      data-testid="gizmo-hub"
      :cx="gizmo.originX"
      :cy="gizmo.originY"
      r="3.5"
    />

    <!-- The rotate dial (TODO/ui-064), only while a ring is being dragged: on
         top of the drawn handles, under the (invisible) hit targets, and
         `pointer-events: none` like everything else here but the grabs. -->
    <RotateDial
      v-if="dialAnnotation && dialAnnotation.visible"
      :dial="dialAnnotation"
      :color="AXIS_STROKE[dialAnnotation.axis]"
    />

    <!-- Hit targets, drawn last so they sit above everything they stand for.
         Invisible and far fatter than the handles they cover; the rings come
         first so that where an arm crosses a ring, the arm wins. -->
    <polygon
      v-for="ring in ringPaths"
      v-show="ringShown(ring.axis)"
      :key="`grab-ring-${ring.axis}`"
      class="tgizmo__grab tgizmo__grab--ring"
      :data-testid="`gizmo-grab-ring-${ring.axis.toLowerCase()}`"
      :points="ring.points"
      @pointerdown="onHandleDown($event, 'rotate', ringPaths.indexOf(ring))"
      @pointermove="onHandleMove"
      @pointerup="onHandleUp"
      @pointercancel="onHandleUp"
    />
    <line
      v-for="(grab, index) in armGrabs"
      v-show="grab.visible"
      :key="`grab-arm-${grab.axis}`"
      class="tgizmo__grab tgizmo__grab--arm"
      :data-testid="`gizmo-grab-arm-${grab.axis.toLowerCase()}`"
      :x1="grab.x1"
      :y1="grab.y1"
      :x2="grab.x2"
      :y2="grab.y2"
      @pointerdown="onHandleDown($event, 'translate', index)"
      @pointermove="onHandleMove"
      @pointerup="onHandleUp"
      @pointercancel="onHandleUp"
    />
  </svg>
</template>

<style scoped>
.tgizmo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* The surface itself never takes a pointer: the gizmo sits directly over the
     bodies the user clicks to select, and swallowing those clicks would break
     the very trigger it is the feedback for. Only the hit targets below opt in. */
  pointer-events: none;
}

.tgizmo__grab {
  stroke: transparent;
  /* `stroke`, not `all`: a ring's hit area is its band, never the disc inside
     it, which is exactly where the body the user still needs to click sits. */
  pointer-events: stroke;
  /* 22px against a 3px arm — aimable with a mouse without being a wall. */
  stroke-width: 22;
  cursor: grab;
}

.tgizmo__grab:active {
  cursor: grabbing;
}

.tgizmo__grab--arm {
  stroke-linecap: round;
}

.tgizmo__grab--ring {
  fill: none;
}

/* Phone width: a fingertip covers roughly 9mm of glass against a mouse
   pointer's single pixel, so the handles need a genuinely bigger catchment —
   not the same target with a bigger icon (interaction-model-qa control 4, Q16). */
@media (max-width: 640px) {
  .tgizmo__grab {
    stroke-width: 34;
  }
}

/*
 * TODO/ui-021: the shared "lift it off the scene" cue. A soft, dark
 * drop-shadow reads as depth in *both* themes — unlike a stroke or fill
 * colour, a shadow doesn't need a light/dark variant, because "something is
 * slightly raised above what's behind it" looks the same regardless of which
 * theme is drawing what's behind it. Kept small (1-2px) so it stays a depth
 * cue rather than a glow.
 */
.tgizmo__ring {
  fill: none;
  /* Widened from the original 1.5px into a band (TODO/ui-021): this is now the
     "tube wall" half of the double-stroke tube cue, with `.tgizmo__ring-core`
     below drawn on top as the "tube's lit side" highlight. */
  stroke-width: 3;
  stroke-opacity: 0.5;
  /* Keeps the stroke a real width even where a ring is seen almost edge-on. */
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.32));
}

.tgizmo__ring-core {
  fill: none;
  stroke-width: 1;
  stroke-opacity: 0.9;
  vector-effect: non-scaling-stroke;
  /* Pure decoration on top of `.tgizmo__ring`'s own hit-test story: the grab
     targets are a separate, later set of elements, per this component's own
     header comment, and this core adds no hit target of its own. */
  pointer-events: none;
}

.tgizmo__ring-arrow {
  /* Slightly more opaque than the ring's own faint stroke so the direction
     cue reads clearly without competing with the translate arms' heads. */
  opacity: 0.75;
}

.tgizmo__arm {
  /* Width comes from `GIZMO_SHAFT_WIDTH_PX`, bound on the element, because the
     shaft's gradient line has to span exactly that width (TODO/ui-048). */
  stroke-linecap: butt;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

/* Smaller heads (TODO/ui-048) get a tighter shadow than ui-021's 1.5px blur,
   which smudged a 15px cone into a blob. */
.tgizmo__head,
.tgizmo__cone-base {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

.tgizmo__hub {
  fill: var(--text-1);
  stroke: var(--surface-0);
  stroke-width: 1.5;
  filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.32));
}
</style>
