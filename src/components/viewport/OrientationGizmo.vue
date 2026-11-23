<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * Orientation gizmo: the shaded view cube (`TODO/ui-158`), in a fixed screen-space corner.
 *
 * CLAUDE.md's viewport rule: the gizmo "shows the current camera orientation and can itself be
 * clicked/tapped to snap to a standard view." The cube turns against the camera as the view orbits,
 * so it always shows the world the way the main view does, and each face turned toward the viewer is
 * a real button that snaps the camera to that face's view. WarpCad1's cube, which the owner asked
 * for: solid, unlabelled, about 96 px, drawn orthographically, with fixed "lit from above" grey
 * shades and dark edges, bare in the corner with no card.
 *
 * It is DOM, not a second WebGL canvas: no extra context (iOS Safari caps them), no always-on frame
 * loop (it redraws only when the camera's azimuth or elevation changes), and each face is an ordinary
 * `<button>` the browser hit-tests and a spec can find by `data-testid`. Each face is placed by a
 * flat 2D `matrix()` from `src/render/viewCube.js` rather than inside a `preserve-3d` context,
 * because engines disagree on hit-testing back-facing 3D children. Faces turned away or edge-on
 * (depth ≤ 0) are hidden, take no pointer and leave the accessibility tree; **Views** reaches them.
 *
 * Z-up mapping, per CLAUDE.md: the face you click is the side the camera ends up on. Top → looking
 * straight down Z, Front → camera on −Y, Right → camera on +X. `viewCube.spec.js` pins the signs.
 */
import { computed, onBeforeUnmount, ref, watch, watchPostEffect } from 'vue'
import { VIEW_CUBE_FACES, faceTransforms, facingFaces, isFacing } from '../../render/viewCube.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'

const props = defineProps({
  azimuthDeg: { type: Number, required: true },
  elevationDeg: { type: Number, required: true },
  /**
   * Whether snapping is currently unavailable (`TODO/ui-020`, kept by `TODO/sketch-001`: the sketch
   * editor owns the camera orientation while it is open).
   *
   * The cube keeps turning: it is still the honest readout of where the camera is looking, and that
   * reassurance is exactly what a user wants while locked to the working plane. Only its faces, Home
   * and Views go dead, because snapping to Front mid-sketch would turn the sketch plane edge-on and
   * make drawing silently impossible: a screen-point ray parallel to the plane has no intersection, so
   * every drag would land nowhere with no explanation.
   */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['snap'])

/**
 * The chrome tier (`TODO/ui-084`): `compact` on a narrow viewport pane, from the layout store. Compact
 * keeps the cube's size but tucks it 8px in and hides the az/el caption, like the ≤ 480px rules.
 */
const panelLayout = usePanelLayoutStore()
const chromeTier = computed(() => panelLayout.layout.chromeTier)

const LOCKED_TITLE = 'Camera orientation is locked to the working plane while sketching'

/** Scratch for the per-change re-projection, so moving the camera allocates no arrays. */
const depths = new Float64Array(6)
const affines = new Float64Array(36)
/** @type {(HTMLElement | null)[]} the six face buttons, in `VIEW_CUBE_FACES` order */
const faceEls = [null, null, null, null, null, null]

/** @param {number} n @returns {string} */
const num = (n) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(6))

/**
 * Turn the cube to the camera. Written straight to the six buttons rather than through a reactive
 * array: the camera moves every orbit frame, and a fresh array of six style objects per frame is the
 * allocation CLAUDE.md's 16 ms budget forbids. Vue binds nothing these attributes touch.
 */
function orient() {
  const az = props.azimuthDeg
  const el = props.elevationDeg
  facingFaces(az, el, depths)
  faceTransforms(az, el, affines)
  for (let i = 0; i < 6; i++) {
    const face = faceEls[i]
    if (!face) continue
    const k = i * 6
    face.style.transform =
      `translate(calc(${num(affines[k + 4])} * var(--layout-cube-side)), calc(${num(affines[k + 5])} * var(--layout-cube-side))) ` +
      `matrix(${num(affines[k])}, ${num(affines[k + 1])}, ${num(affines[k + 2])}, ${num(affines[k + 3])}, 0, 0)`
    const facing = isFacing(depths[i])
    face.setAttribute('data-facing', facing ? 'true' : 'false')
    face.setAttribute('data-depth', depths[i].toFixed(3))
    if (facing) {
      face.removeAttribute('aria-hidden')
      face.removeAttribute('tabindex')
    } else {
      face.setAttribute('aria-hidden', 'true')
      face.setAttribute('tabindex', '-1')
    }
  }
}
watchPostEffect(orient)

/**
 * One ref callback per face, built once: a fresh closure per render would make Vue detach and
 * re-attach every face's ref on each camera move.
 * @type {ReadonlyArray<(el: Element | import('vue').ComponentPublicInstance | null) => void>}
 */
const FACE_REFS = VIEW_CUBE_FACES.map((_, i) => (el) => {
  faceEls[i] = el instanceof HTMLElement ? el : null
})

/**
 * **Views** (`TODO/ui-148`'s phone picker, now at every width): a grid of all six faces. It is the
 * only way to the faces turned away from the camera, and the way off a face-on view, where the four
 * side faces are edge-on and cannot be clicked. Six large cells with no gap between them, so a tap
 * inside always lands on one; picking closes it.
 */
const pickerOpen = ref(false)
watch(
  () => props.disabled,
  (off) => {
    if (off) pickerOpen.value = false
  },
)
watch(pickerOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onOutsidePointerDown, true)
  else document.removeEventListener('pointerdown', onOutsidePointerDown, true)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointerDown, true))

/** @type {import('vue').Ref<HTMLElement | null>} */
const pickerEl = ref(null)
/** @type {import('vue').Ref<HTMLElement | null>} */
const viewsEl = ref(null)

/** @param {PointerEvent} event */
function onOutsidePointerDown(event) {
  const t = event.target
  if (!(t instanceof Node)) return
  if (pickerEl.value?.contains(t) || viewsEl.value?.contains(t)) return
  pickerOpen.value = false
}

/**
 * The six faces in the grid's reading order, with the axis each one's camera sits on.
 * @type {ReadonlyArray<{view: string, name: string, label: string}>}
 */
const PICKER_FACES = Object.freeze([
  { view: 'top', name: 'Top', label: 'Z' },
  { view: 'front', name: 'Front', label: '−Y' },
  { view: 'right', name: 'Right', label: 'X' },
  { view: 'bottom', name: 'Bottom', label: '−Z' },
  { view: 'back', name: 'Back', label: 'Y' },
  { view: 'left', name: 'Left', label: '−X' },
])

/** @param {string} view a face name, or 'home' */
function pick(view) {
  pickerOpen.value = false
  emit('snap', view)
}

const orientationLabel = computed(() => `${Math.round(props.azimuthDeg)}° az · ${Math.round(props.elevationDeg)}° el`)
</script>

<template>
  <div
    class="gizmo"
    data-testid="orientation-gizmo"
    :data-disabled="disabled ? 'true' : 'false'"
    :data-azimuth="azimuthDeg.toFixed(2)"
    :data-elevation="elevationDeg.toFixed(2)"
    :data-chrome-tier="chromeTier"
    :data-picker-open="pickerOpen ? 'true' : 'false'"
  >
    <div class="gizmo__cube" data-testid="view-cube" role="group" aria-label="Camera orientation">
      <button
        v-for="(face, i) in VIEW_CUBE_FACES"
        :key="face.view"
        :ref="FACE_REFS[i]"
        type="button"
        class="gizmo__face"
        :class="`gizmo__face--${face.view}`"
        :data-testid="`gizmo-view-${face.view}`"
        :data-view="face.view"
        :disabled="disabled"
        :title="disabled ? LOCKED_TITLE : face.title"
        :aria-label="face.title"
        @click="emit('snap', face.view)"
      />
    </div>

    <div class="gizmo__actions">
      <button
        type="button"
        class="gizmo__btn"
        data-testid="gizmo-view-home"
        :disabled="disabled"
        title="Home view (isometric)"
        aria-label="Home view (isometric)"
        @click="pick('home')"
      >
        Home
      </button>
      <button
        ref="viewsEl"
        type="button"
        class="gizmo__btn"
        data-testid="gizmo-views"
        :disabled="disabled"
        :title="disabled ? LOCKED_TITLE : 'Pick any view, including the faces turned away'"
        aria-label="Pick a view"
        :aria-expanded="pickerOpen ? 'true' : 'false'"
        @click="pickerOpen = !pickerOpen"
      >
        Views
      </button>
    </div>
    <p class="gizmo__caption" data-testid="gizmo-orientation-label">{{ orientationLabel }}</p>

    <div
      v-if="pickerOpen"
      ref="pickerEl"
      class="gizmo__picker"
      data-testid="gizmo-picker"
      role="group"
      aria-label="Pick a view"
      @keydown.esc="pickerOpen = false"
    >
      <p class="gizmo__picker-head" data-testid="gizmo-picker-label">Views · {{ orientationLabel }}</p>
      <div class="gizmo__picker-grid">
        <button
          v-for="face in PICKER_FACES"
          :key="face.view"
          type="button"
          class="gizmo__picker-cell"
          :data-testid="`gizmo-picker-view-${face.view}`"
          :aria-label="`${face.name} view`"
          @click="pick(face.view)"
        >
          <span class="gizmo__picker-name">{{ face.name }}</span>
          <span class="gizmo__picker-axis">{{ face.label }}</span>
        </button>
      </div>
      <div class="gizmo__picker-foot">
        <button type="button" class="gizmo__picker-btn" data-testid="gizmo-picker-home" aria-label="Home view (isometric)" @click="pick('home')">Home</button>
        <button type="button" class="gizmo__picker-btn" data-testid="gizmo-picker-close" aria-label="Close view picker" @click="pickerOpen = false">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The cube's size. A box of √3 × the side holds the cube's silhouette at any orientation. 55px keeps
   the box at about 96px (WarpCad1's), and a corner-on face's short diagonal (0.816 × side) at 45px. */
.gizmo {
  --layout-cube-side: 55px;
  --layout-cube-box: 96px;
  --layout-gizmo-btn-height: 28px;

  position: absolute;
  top: 12px;
  right: 12px;
  width: var(--layout-cube-box);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.gizmo__cube {
  position: relative;
  width: var(--layout-cube-box);
  height: var(--layout-cube-box);
}

/* Each face is a square centred in the box; `orient()` sets its transform. Flat fill per face, the
   edges drawn as borders. */
.gizmo__face {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--layout-cube-side);
  height: var(--layout-cube-side);
  margin: calc(var(--layout-cube-side) / -2) 0 0 calc(var(--layout-cube-side) / -2);
  padding: 0;
  box-sizing: border-box;
  border: 1px solid var(--view-cube-edge);
  border-radius: 0;
  background: var(--face-fill);
  transform-origin: 50% 50%;
  appearance: none;
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__face--top { --face-fill: var(--view-cube-top); }
.gizmo__face--front { --face-fill: var(--view-cube-front); }
.gizmo__face--right { --face-fill: var(--view-cube-right); }
.gizmo__face--back { --face-fill: var(--view-cube-back); }
.gizmo__face--left { --face-fill: var(--view-cube-left); }
.gizmo__face--bottom { --face-fill: var(--view-cube-bottom); }

/* Turned away or edge-on: no paint, no pointer. `orient()` also drops it from the tab order and the
   accessibility tree. Not left to `backface-visibility`, which engines hit-test differently. */
.gizmo__face[data-facing='false'] {
  visibility: hidden;
  pointer-events: none;
}

.gizmo__face:hover:not(:disabled),
.gizmo__face:focus-visible {
  background: color-mix(in srgb, var(--accent) 45%, var(--face-fill));
}

.gizmo__face:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -3px;
}

/* Visibly unavailable rather than silently inert, per CLAUDE.md's rule that a control whose
   precondition does not hold is disabled, not dead. The cube still turns. */
.gizmo[data-disabled='true'] .gizmo__face {
  opacity: 0.55;
  cursor: not-allowed;
}

.gizmo[data-disabled='true'] .gizmo__btn {
  opacity: 0.4;
  cursor: not-allowed;
}

.gizmo__actions {
  display: flex;
  gap: var(--space-2);
  width: 100%;
}

.gizmo__btn {
  flex: 1;
  min-width: 0;
  min-height: var(--layout-gizmo-btn-height);
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: var(--text-size-xs);
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__btn:hover:not(:disabled),
.gizmo__btn:focus-visible,
.gizmo__btn[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

/* Bare on the canvas, so the caption gets its own glass behind it to stay readable over the grid. */
.gizmo__caption {
  margin: 0;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-glass);
  font-family: var(--font-mono);
  font-size: var(--text-size-2xs);
  color: var(--text-3);
  white-space: nowrap;
}

/* The compact form (`TODO/ui-084`): the ≤ 480px rules below, keyed on the chrome tier as well. Keep
   this block and the media block in step. */
.gizmo[data-chrome-tier='compact'] {
  top: 8px;
  right: 8px;
}

.gizmo[data-chrome-tier='compact'] .gizmo__caption {
  display: none;
}

/* A fingertip gets slightly taller buttons, still inside the 138px the compact triad took. */
@media (pointer: coarse) {
  .gizmo {
    --layout-gizmo-btn-height: 32px;
  }
}

/* Touch layout at tablet width and up (`TODO/ui-134`'s room, where the triad's dial was 190px): a
   96px side, so a fingertip (about 13px of scatter) aimed at a face's centre lands on that face, not
   a neighbour, 99 times in 100 (the centre sits 34px from each shared edge). Keyed like the compact
   rules so it wins. Not on a phone: 390px cannot hold this beside the Operations toolbar. */
@media (pointer: coarse) and (min-width: 600px) {
  .gizmo[data-chrome-tier] {
    --layout-cube-side: 96px;
    --layout-cube-box: 168px;
    --layout-gizmo-btn-height: var(--tap);
  }
}

/* The Views grid: anchored to the gizmo's top-right corner, covering the cube while open. Six
   68x64px cells with no gap, so every tap inside lands on a cell. While it is open the whole gizmo
   paints above the Operations toolbar it overlaps. */
.gizmo[data-picker-open='true'] {
  z-index: calc(var(--z-canvas-overlay) + 4);
}

.gizmo__picker {
  position: absolute;
  top: 0;
  right: 0;
  z-index: var(--z-popover);
  width: max-content;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
}

.gizmo__picker-head {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-size-2xs);
  color: var(--text-3);
  text-align: center;
}

.gizmo__picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 68px);
  grid-auto-rows: 64px;
}

.gizmo__picker-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 0;
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: var(--text-size-sm);
  font-weight: var(--weight-medium);
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__picker-cell:hover,
.gizmo__picker-cell:active,
.gizmo__picker-cell:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.gizmo__picker-axis {
  font: 500 var(--text-size-2xs) / 1 var(--font-mono);
  color: var(--text-3);
}

.gizmo__picker-foot {
  display: flex;
  gap: var(--space-2);
}

.gizmo__picker-btn {
  flex: 1;
  min-height: var(--tap);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: var(--text-size-xs);
  cursor: pointer;
  touch-action: manipulation;
}

@media (max-width: 480px) {
  .gizmo {
    top: 8px;
    right: 8px;
  }

  .gizmo__caption {
    display: none;
  }
}
</style>
