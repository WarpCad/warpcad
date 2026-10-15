<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Split sheet's cut plane, drawn over the viewport (`TODO/io-007`): a translucent
 * quadrilateral where the plane slices the body, and a round handle at its centre that drags
 * the plane along its axis — the touch-friendly half of the sheet's offset control (the
 * number field is the other half; both write the same `offsetMm`).
 *
 * Geometry comes from `src/render/cutPlane.js`, re-projected by `Viewport.vue` every frame
 * so the plane stays on the body while the camera moves. Only the handle takes pointer
 * events; the plane itself never swallows a click meant for the canvas.
 *
 * The handle is a 44 px target (`--tap`) at every width. `data-cut-mm`, `data-axis-x/y` and
 * `data-px-per-mm` are for specs: where the plane is, and which way a drag moves it;
 * `data-face-u/v/centre` and `data-handle` give the face's millimetre-to-pixel map the markers use.
 */
import { computed, ref, watchEffect } from 'vue'

import { cutPlaneDragDeltaMm, faceToScreen, faceViewIsUsable, screenToFace } from '../../render/cutPlane.js'
import { useSplitSheetStore } from '../../stores/splitSheet.js'
import ConnectorMarker from './ConnectorMarker.vue'

const props = defineProps({
  /** `src/render/cutPlane.js`'s annotation, mutated in place each frame. */
  annotation: {
    type: /** @type {import('vue').PropType<import('../../render/cutPlane.js').CutPlaneAnnotation>} */ (Object),
    required: true,
  },
})

const sheet = useSplitSheetStore()

/** The `<svg>`, to turn pointer client coordinates into the overlay's own frame. */
const root = ref(/** @type {SVGSVGElement | null} */ (null))

const shown = computed(() => sheet.isOpen && props.annotation.visible && Number.isFinite(sheet.cutMm))
const pxPerMm = computed(() => Math.hypot(props.annotation.axisX, props.annotation.axisY))

 /**
 * Place connectors (`TODO/ui-067`): markers and the clearance overlay are live only while the
 * camera sees the face squarely enough that a pixel is a few millimetres, not a few dozen.
 */
const placing = computed(() => shown.value && sheet.manual)
const usable = computed(() => placing.value && faceViewIsUsable(props.annotation))
watchEffect(() => {
  sheet.faceViewUsable = !placing.value || usable.value
})

/** The face's cells where nothing fits, merged along each row into runs — one `rect` each. */
const dimmedRuns = computed(() => {
  const face = sheet.face
  if (!placing.value || !face) return []
  const cellU = (face.uRange[1] - face.uRange[0]) / face.columns
  const cellV = (face.vRange[1] - face.vRange[0]) / face.rows
  /** @type {{ x: number, y: number, width: number, height: number }[]} */
  const runs = []
  for (let row = 0; row < face.rows; row += 1) {
    let start = -1
    for (let column = 0; column <= face.columns; column += 1) {
      const dim = column < face.columns && face.fits[row * face.columns + column] === 0
      if (dim && start < 0) start = column
      if (!dim && start >= 0) {
        runs.push({
          x: face.uRange[0] + start * cellU,
          y: face.vRange[0] + row * cellV,
          width: (column - start) * cellU,
          height: cellV,
        })
        start = -1
      }
    }
  }
  return runs
})

/** The face-to-screen map as an SVG `matrix`, so the runs above are drawn in millimetres. */
const faceMatrix = computed(() => {
  const a = props.annotation
  const e = a.handleX - a.centreU * a.uX - a.centreV * a.vX
  const f = a.handleY - a.centreU * a.uY - a.centreV * a.vY
  return `matrix(${a.uX} ${a.uY} ${a.vX} ${a.vY} ${e} ${f})`
})

const scratchPoint = { x: 0, y: 0 }
const scratchFace = { uMm: 0, vMm: 0 }

/** Where each marker is drawn: the dragged one follows the pointer, the rest sit on the face. */
const drawn = computed(() =>
  sheet.markers.map((marker) => {
    const dragged = sheet.drag?.id === marker.id ? sheet.drag : null
    const uMm = dragged?.uMm ?? marker.uMm
    const vMm = dragged?.vMm ?? marker.vMm
    const at = faceToScreen(props.annotation, uMm, vMm, scratchPoint)
    const index = sheet.markers.indexOf(marker)
    const verdict = sheet.verdicts[index]
    /** @type {'ok' | 'bad' | 'pending'} */
    let state = verdict ? (verdict.ok ? 'ok' : 'bad') : 'pending'
    if (dragged) state = dragged.ok === null ? 'pending' : dragged.ok ? 'ok' : 'bad'
    return { ...marker, uMm, vMm, x: at.x, y: at.y, state, dragging: dragged !== null }
  })
)

/** Client coordinates as a face position, or `null` while the face is seen edge-on. */
function faceAt(/** @type {number} */ clientX, /** @type {number} */ clientY) {
  const box = root.value?.getBoundingClientRect()
  if (!box) return null
  return screenToFace(props.annotation, clientX - box.left, clientY - box.top, { uMm: 0, vMm: 0 })
}

/** Face coordinates a person can read: tenths of a millimetre. */
const tenth = (/** @type {number} */ mm) => Math.round(mm * 10) / 10

/** The offset between the pointer and the marker's centre when a drag began, in face mm. */
let grab = { uMm: 0, vMm: 0 }

/** @param {{ id: string, clientX: number, clientY: number }} event */
function onMarkerDragStart(event) {
  const marker = sheet.markers.find((m) => m.id === event.id)
  const at = faceAt(event.clientX, event.clientY)
  grab = marker && at ? { uMm: marker.uMm - at.uMm, vMm: marker.vMm - at.vMm } : { uMm: 0, vMm: 0 }
}

/** @param {{ id: string, clientX: number, clientY: number }} event */
function onMarkerDrag(event) {
  const at = faceAt(event.clientX, event.clientY)
  if (!at) return
  sheet.dragMarker(event.id, tenth(at.uMm + grab.uMm), tenth(at.vMm + grab.vMm))
}

/** @param {{ id: string, clientX: number, clientY: number }} event */
function onMarkerDragEnd(event) {
  const at = faceAt(event.clientX, event.clientY)
  if (!at) {
    sheet.cancelDrag()
    return
  }
  void sheet.moveMarker(event.id, tenth(at.uMm + grab.uMm), tenth(at.vMm + grab.vMm))
}

/** A tap on the face drops a marker; a drag across it (orbiting a finger over the plane) does not. */
const tap = { pointerId: -1, x: 0, y: 0, at: 0 }

/** @param {PointerEvent} event */
function onFaceDown(event) {
  if (!usable.value || event.button > 0) return
  tap.pointerId = event.pointerId
  tap.x = event.clientX
  tap.y = event.clientY
  tap.at = event.timeStamp
}

/** @param {PointerEvent} event */
function onFaceUp(event) {
  if (event.pointerId !== tap.pointerId) return
  tap.pointerId = -1
  if (event.type === 'pointercancel') return
  if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8 || event.timeStamp - tap.at > 600) return
  const at = faceAt(event.clientX, event.clientY)
  if (!at) return
  sheet.selectMarker(null)
  void sheet.addMarker(tenth(at.uMm), tenth(at.vMm))
}

/** The drag in progress: where it began and the offset it began at. Plain, not reactive. */
const drag = { pointerId: -1, lastX: 0, lastY: 0, startOffsetMm: 0, travelMm: 0 }

/** @param {PointerEvent} event */
function onDown(event) {
  if (typeof sheet.offsetMm !== 'number') return
  event.preventDefault()
  event.stopPropagation()
  drag.pointerId = event.pointerId
  drag.lastX = event.clientX
  drag.lastY = event.clientY
  drag.startOffsetMm = sheet.offsetMm
  drag.travelMm = 0
  const target = /** @type {Element} */ (event.currentTarget)
  try {
    target.setPointerCapture(event.pointerId)
  } catch {
    // A synthetic pointer (a spec) has no capture to take; moves still arrive on the handle.
  }
}

/** @param {PointerEvent} event */
function onMove(event) {
  if (event.pointerId !== drag.pointerId) return
  event.preventDefault()
  advance(event)
}

/**
 * Add this move's travel to the drag, in millimetres. Each step is converted with the axis as
 * projected *now*, so the handle keeps tracking the finger while perspective changes how many
 * pixels a millimetre is as the plane moves — a single start-to-now conversion would drift.
 *
 * @param {PointerEvent} event
 */
function advance(event) {
  drag.travelMm += cutPlaneDragDeltaMm(props.annotation, event.clientX - drag.lastX, event.clientY - drag.lastY)
  drag.lastX = event.clientX
  drag.lastY = event.clientY
  sheet.dragOffset(drag.startOffsetMm, drag.travelMm)
}

/** @param {PointerEvent} event */
function onUp(event) {
  if (event.pointerId !== drag.pointerId) return
  drag.pointerId = -1
  // A cancelled pointer (the browser took the touch over) carries no position: keep the offset
  // the drag had reached rather than computing a move from coordinates it does not have.
  if (event.type === 'pointercancel') return
  advance(event)
}
</script>

<template>
  <svg
    v-if="shown"
    ref="root"
    class="cut-plane"
    :class="{ 'cut-plane--placing': usable }"
    data-testid="cut-plane"
    :data-cut-mm="sheet.cutMm.toFixed(2)"
    :data-axis-x="annotation.axisX.toFixed(4)"
    :data-axis-y="annotation.axisY.toFixed(4)"
    :data-px-per-mm="pxPerMm.toFixed(4)"
    :data-face-u="`${annotation.uX.toFixed(4)},${annotation.uY.toFixed(4)}`"
    :data-face-v="`${annotation.vX.toFixed(4)},${annotation.vY.toFixed(4)}`"
    :data-face-centre="`${annotation.centreU.toFixed(3)},${annotation.centreV.toFixed(3)}`"
    :data-handle="`${annotation.handleX.toFixed(2)},${annotation.handleY.toFixed(2)}`"
    aria-hidden="true"
  >
    <polygon
      class="cut-plane__fill"
      data-testid="cut-plane-face"
      :points="annotation.points"
      @pointerdown="onFaceDown"
      @pointerup="onFaceUp"
      @pointercancel="onFaceUp"
    />
    <g v-if="usable" class="cut-plane__field" data-testid="cut-plane-field" :transform="faceMatrix">
      <rect
        v-for="(run, index) in dimmedRuns"
        :key="index"
        :x="run.x"
        :y="run.y"
        :width="run.width"
        :height="run.height"
      />
    </g>
    <circle
      class="cut-plane__handle"
      data-testid="cut-plane-handle"
      :cx="annotation.handleX"
      :cy="annotation.handleY"
      r="22"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    />
    <circle class="cut-plane__dot" :cx="annotation.handleX" :cy="annotation.handleY" r="7" />
    <template v-if="usable">
      <ConnectorMarker
        v-for="marker in drawn"
        :id="marker.id"
        :key="marker.id"
        :kind="marker.kind"
        :u-mm="marker.uMm"
        :v-mm="marker.vMm"
        :x="marker.x"
        :y="marker.y"
        :state="marker.state"
        :dragging="marker.dragging"
        :selected="sheet.selectedMarkerId === marker.id"
        @select="sheet.selectMarker($event)"
        @drag-start="onMarkerDragStart"
        @drag="onMarkerDrag"
        @drag-end="onMarkerDragEnd"
        @cancel="sheet.cancelDrag()"
        @remove="sheet.removeMarker($event)"
      />
    </template>
  </svg>
</template>

<style scoped>
.cut-plane {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  /* The handle is dragged with a finger: the browser must not claim the touch for a scroll or zoom. */
  touch-action: none;
  z-index: 3;
}

.cut-plane__fill {
  fill: var(--accent);
  fill-opacity: 0.18;
  stroke: var(--accent);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}

.cut-plane--placing .cut-plane__fill {
  /* Place connectors: a tap on the plane drops a marker, so the plane takes pointer events. */
  pointer-events: auto;
  cursor: crosshair;
}

.cut-plane__field rect {
  fill: var(--danger);
  fill-opacity: 0.32;
  pointer-events: none;
  shape-rendering: crispEdges;
}

.cut-plane__handle {
  fill: var(--accent);
  fill-opacity: 0.22;
  stroke: var(--accent);
  stroke-width: 2;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}

.cut-plane__dot {
  fill: var(--accent);
  pointer-events: none;
}
</style>
