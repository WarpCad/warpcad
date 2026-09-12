<script setup>
/**
 * Sketch geometry on the working plane: committed lines, the live draft
 * segment, and the selected line's two endpoint handles (`TODO/ui-020`).
 *
 * ## Why an SVG overlay and not a mesh in the scene
 *
 * Section 7's Q10 asks for a stroke "distinct in style (a thin, bright,
 * single-color stroke — not a 3D solid's shaded material) … so a user can tell
 * at a glance that what they just drew is sketch geometry, not a body." An SVG
 * stroke *is* that, exactly, with no material to tune; a `THREE.Line` would be a
 * second rendering technology for the same job, which CLAUDE.md's note on
 * `render-001` explicitly warns against. Three further consequences fall out,
 * all of them wanted:
 *
 * - **Picking is exact, and costs this overlay no hit targets at all.** A click
 *   resolves against the projected segment in `Viewport.vue`'s `sketchEntityAt`
 *   (`distanceToSegmentPx` within a pixel tolerance), rather than a WebGL
 *   raycast against a zero-thickness line and its threshold fudge.
 *
 *   This is why the strokes below carry **no invisible fat companion** of the
 *   kind `Gizmo.vue`'s arms and rings need. An earlier draft had them, and the
 *   acceptance drive caught what they actually did: a transparent 18px-wide
 *   `pointer-events: stroke` line sits *above* the canvas, so pressing on a
 *   drawn line swallowed the `pointerdown` — a drag started there orbited
 *   nothing outside sketch mode and drew nothing inside it. The line became an
 *   invisible dead strip across the viewport. The pixel tolerance already
 *   provides the fat target that a fingertip needs, without taking the gesture
 *   away from the canvas that owns it. The endpoint handles below *do* keep
 *   their pointer events, because grabbing one is genuinely their own gesture.
 * - **The endpoint handles are real DOM hit targets**, the same way
 *   `Gizmo.vue`'s handles are, so they are tappable at fingertip size and
 *   assertable by an `*.e2e.js` spec on all three engines without pixel-picking
 *   a canvas.
 * - **Sketch geometry draws on top of solids** rather than being occluded by
 *   them. That is the right answer for a 2D construction layer, and it is what a
 *   CAD user expects of sketch entities.
 *
 * It still tracks the camera: every stroke is re-projected each frame from the
 * *same* orbit state the WebGL frame was drawn with (`src/render/annotate.js`'s
 * `updateSketchStroke`), which is `render-001`'s one-camera rule.
 *
 * ## No maths here
 *
 * Every number below comes from `src/render/annotate.js`. This file lays out
 * pixels — CLAUDE.md: "a component doing coordinate math beyond laying out its
 * own pixels is a bug waiting to happen."
 */
import { computed } from 'vue'

const props = defineProps({
  /**
   * `SketchStrokeAnnotation`s from `src/render/annotate.js`, mutated in place by
   * the viewport's render callback rather than replaced per frame.
   */
  strokes: { type: Array, required: true },
  /** The live segment being dragged out, or a stroke with `visible: false`. */
  draft: { type: Object, required: true },
  /** The selected entity's id, or `''`. Drives the highlight and the handles. */
  selectedId: { type: String, default: '' },
})

const emit = defineEmits(['handle-down', 'handle-move', 'handle-up'])

/** @type {import('vue').ComputedRef<import('../../render/annotate.js').SketchStrokeAnnotation[]>} */
const lines = computed(() => /** @type {any} */ (props.strokes))
/** @type {import('vue').ComputedRef<import('../../render/annotate.js').SketchStrokeAnnotation>} */
const draftStroke = computed(() => /** @type {any} */ (props.draft))

/** The selected stroke, when it is on screen — the only one that gets handles. */
const selectedStroke = computed(() =>
  lines.value.find((stroke) => stroke.visible && stroke.id === props.selectedId),
)

/**
 * @param {PointerEvent} event
 * @param {'start' | 'end'} which
 */
function onHandleDown(event, which) {
  event.stopPropagation()
  event.preventDefault()
  try {
    /** @type {Element} */ (event.currentTarget).setPointerCapture?.(event.pointerId)
  } catch {
    // Capture is an optimisation, not a requirement — and it throws outright on
    // a pointer id the browser doesn't consider active (synthetic events in
    // tests). Losing it only means the drag ends if the pointer leaves.
  }
  emit('handle-down', { which, clientX: event.clientX, clientY: event.clientY })
}

/** @param {PointerEvent} event */
function onHandleMove(event) {
  if (event.buttons === 0 && event.pointerType === 'mouse') return
  emit('handle-move', { clientX: event.clientX, clientY: event.clientY })
}

/** @param {PointerEvent} event */
function onHandleUp(event) {
  try {
    /** @type {Element} */ (event.currentTarget).releasePointerCapture?.(event.pointerId)
  } catch {
    // Same as capture above: never let cleanup throw out of a pointer handler.
  }
  emit('handle-up', { cancelled: event.type === 'pointercancel' })
}

const visibleCount = () => lines.value.filter((stroke) => stroke.visible).length
</script>

<template>
  <svg
    class="sketch"
    data-testid="sketch-strokes"
    :data-stroke-count="visibleCount()"
    :data-drafting="draftStroke.visible ? 'true' : 'false'"
  >
    <!-- No per-line hit target here, deliberately — see the note above about
         `sketchEntityAt`. -->
    <template v-for="stroke in lines" :key="stroke.id">
      <line
        v-show="stroke.visible"
        class="sketch__line"
        :class="{ 'sketch__line--selected': stroke.id === selectedId }"
        :data-testid="`sketch-line-${stroke.id}`"
        :data-entity-id="stroke.id"
        :data-length-mm="stroke.lengthMm.toFixed(3)"
        :data-selected="stroke.id === selectedId ? 'true' : 'false'"
        :x1="stroke.x1"
        :y1="stroke.y1"
        :x2="stroke.x2"
        :y2="stroke.y2"
      />
    </template>

    <!-- The live preview segment: the same "what you are about to commit is
         drawn where it will land" contract as `ui-010`'s placement ghost. -->
    <line
      v-show="draftStroke.visible"
      class="sketch__line sketch__line--draft"
      data-testid="sketch-draft"
      :data-length-mm="draftStroke.lengthMm.toFixed(3)"
      :x1="draftStroke.x1"
      :y1="draftStroke.y1"
      :x2="draftStroke.x2"
      :y2="draftStroke.y2"
    />

    <!-- Endpoint handles: the 2D answer to the 3D transform gizmo (section 7's
         Q14). Present only for the selected entity, and only two of them —
         there is no whole-entity translate/rotate affordance here on purpose. -->
    <template v-if="selectedStroke">
      <circle
        v-for="handle in [
          { which: 'start', x: selectedStroke.x1, y: selectedStroke.y1 },
          { which: 'end', x: selectedStroke.x2, y: selectedStroke.y2 },
        ]"
        :key="handle.which"
        class="sketch__handle"
        :data-testid="`sketch-handle-${handle.which}`"
        :cx="handle.x"
        :cy="handle.y"
        r="9"
        @pointerdown="onHandleDown($event, handle.which)"
        @pointermove="onHandleMove"
        @pointerup="onHandleUp"
        @pointercancel="onHandleUp"
      />
    </template>
  </svg>
</template>

<style scoped>
.sketch {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* The overlay covers the whole viewport, so it must never swallow the drag
     that draws or the click that selects. Only the hit targets and handles
     below opt back in — the same discipline as `Gizmo.vue`. */
  pointer-events: none;
}

/* A thin, bright, single-colour stroke — deliberately unlike a shaded solid,
   so a user can tell at a glance that this is sketch geometry and not a body
   (interaction-model-qa section 7, Q10). */
.sketch__line {
  stroke: var(--sketch-stroke);
  stroke-width: 1.75;
  stroke-linecap: round;
  fill: none;
}

.sketch__line--selected {
  stroke: var(--accent);
  stroke-width: 2.5;
}

.sketch__line--draft {
  stroke-dasharray: 6 4;
  stroke-opacity: 0.85;
}

.sketch__handle {
  fill: var(--surface-0);
  stroke: var(--accent);
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
  touch-action: none;
}

.sketch__handle:active {
  fill: var(--accent);
  cursor: grabbing;
}

@media (max-width: 480px) {
  /* Fatter at phone width, per control 4 Q16's hit-radius rule — a fingertip
     covers far more than a 9px circle. */
  .sketch__handle {
    r: 11;
  }
}
</style>
