<script setup>
/**
 * On-screen orbit / pan / zoom controls.
 *
 * This component exists because of one specific line in SECOND-ATTEMPT.md's stop
 * note: *"clicking dragging in the 3D viewport just rotates the base grid"* —
 * orbit-only navigation with no independently reachable pan or zoom. CLAUDE.md
 * turned that into a hard rule: the viewport needs navigation chrome "reachable
 * without a keyboard", because a touch device has none.
 *
 * Every button here emits an event the parent turns into a call on the *same*
 * `src/render/camera.js` model that pointer-drag drives — one camera state, two
 * input paths, never two parallel implementations.
 *
 * The direction pad acts in whichever drag mode is active, so the mode toggle
 * changes what both the pad *and* a viewport drag do — that is what keeps the
 * on-screen control and the gesture honestly equivalent rather than two
 * different features that happen to look alike.
 */
import { computed } from 'vue'

const props = defineProps({
  dragMode: {
    type: /** @type {import('vue').PropType<'orbit' | 'pan'>} */ (String),
    required: true,
  },
})

const emit = defineEmits(['step', 'zoom', 'mode', 'reset'])

const verb = computed(() => (props.dragMode === 'pan' ? 'Pan' : 'Orbit'))

/** @type {ReadonlyArray<{dir: string, glyph: string, cell: string}>} */
const STEPS = Object.freeze([
  { dir: 'up', glyph: '▲', cell: 'up' },
  { dir: 'left', glyph: '◀', cell: 'left' },
  { dir: 'right', glyph: '▶', cell: 'right' },
  { dir: 'down', glyph: '▼', cell: 'down' },
])
</script>

<template>
  <div class="chrome" data-testid="navigation-chrome" :data-drag-mode="dragMode">
    <div class="chrome__modes" role="group" aria-label="Viewport drag mode">
      <button
        type="button"
        class="chrome__mode"
        :class="{ 'chrome__mode--on': dragMode === 'orbit' }"
        :aria-pressed="dragMode === 'orbit'"
        data-testid="nav-mode-orbit"
        title="Drag to orbit"
        @click="emit('mode', 'orbit')"
      >
        Orbit
      </button>
      <button
        type="button"
        class="chrome__mode"
        :class="{ 'chrome__mode--on': dragMode === 'pan' }"
        :aria-pressed="dragMode === 'pan'"
        data-testid="nav-mode-pan"
        title="Drag to pan"
        @click="emit('mode', 'pan')"
      >
        Pan
      </button>
    </div>

    <div class="chrome__row">
      <div class="chrome__pad" role="group" :aria-label="`${verb} the camera`">
        <button
          v-for="step in STEPS"
          :key="step.dir"
          type="button"
          class="chrome__btn"
          :style="{ gridArea: step.cell }"
          :data-testid="`nav-step-${step.dir}`"
          :title="`${verb} camera ${step.dir}`"
          :aria-label="`${verb} camera ${step.dir}`"
          @click="emit('step', step.dir)"
        >
          {{ step.glyph }}
        </button>
        <button
          type="button"
          class="chrome__btn chrome__btn--reset"
          style="grid-area: center"
          data-testid="nav-reset"
          title="Reset camera position, zoom and orientation"
          aria-label="Reset camera position, zoom and orientation"
          @click="emit('reset')"
        >
          ⌂
        </button>
      </div>

      <div class="chrome__zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          class="chrome__btn"
          data-testid="nav-zoom-in"
          title="Zoom in"
          aria-label="Zoom in"
          @click="emit('zoom', 'in')"
        >
          +
        </button>
        <button
          type="button"
          class="chrome__btn"
          data-testid="nav-zoom-out"
          title="Zoom out"
          aria-label="Zoom out"
          @click="emit('zoom', 'out')"
        >
          −
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chrome {
  position: absolute;
  left: 12px;
  bottom: calc(12px + var(--viewport-bottom-inset, 0px));
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.chrome__modes {
  display: flex;
  gap: 4px;
}

.chrome__mode {
  flex: 1;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.chrome__mode--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.chrome__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chrome__pad {
  display: grid;
  grid-template-areas:
    '. up .'
    'left center right'
    '. down .';
  gap: 2px;
}

.chrome__zoom {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chrome__btn {
  width: var(--tap);
  height: var(--tap);
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  /* Keep taps from being swallowed by double-tap-to-zoom on touch engines. */
  touch-action: manipulation;
}

.chrome__btn--reset {
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 16px;
}

.chrome__btn:hover,
.chrome__btn:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.chrome__btn:active {
  background: var(--accent);
  color: var(--accent-contrast);
}

@media (max-width: 480px) {
  .chrome {
    left: 8px;
    bottom: calc(8px + var(--viewport-bottom-inset, 0px));
    padding: 4px;
  }

  .chrome__btn {
    /* Still a comfortable target at 390px width — the whole cluster is
       38×3 + 38 + gaps ≈ 162px, so nothing reflows off-screen and the page
       never scrolls horizontally. */
    width: var(--tap-compact);
    height: var(--tap-compact);
  }

  .chrome__mode {
    min-height: 30px;
    font-size: 11px;
  }
}
</style>
