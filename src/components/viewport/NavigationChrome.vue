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
import { computed, ref } from 'vue'
import { MOUSE_NAV_PRESETS, useSettingsStore } from '../../stores/settings.js'

const props = defineProps({
  dragMode: {
    type: /** @type {import('vue').PropType<'orbit' | 'pan'>} */ (String),
    required: true,
  },
})

const emit = defineEmits(['step', 'zoom', 'mode', 'reset'])

const verb = computed(() => (props.dragMode === 'pan' ? 'Pan' : 'Orbit'))

// TODO/ui-019: the mouse-navigation preset is read straight from the settings
// store — this control both shows and changes it, with no need to round-trip
// through the parent the way the camera controls above do, since nothing
// outside this store cares which preset is active except `Viewport.vue`'s own
// `effectiveDragMode()`, which reads the same store directly.
const settings = useSettingsStore()
const settingsOpen = ref(false)

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
}

/** @param {string} id */
function choosePreset(id) {
  settings.setMouseNavPreset(id)
  // Closing on selection keeps the popover from lingering over the viewport
  // for the drag the user is about to make to try the new preset out.
  settingsOpen.value = false
}

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
      <button
        type="button"
        class="chrome__gear"
        :aria-expanded="settingsOpen"
        data-testid="nav-settings-gear"
        title="Mouse navigation settings"
        aria-label="Mouse navigation settings"
        @click="toggleSettings"
      >
        ⚙
      </button>
    </div>

    <div
      v-if="settingsOpen"
      class="chrome__presets"
      role="group"
      aria-label="Mouse navigation preset"
      data-testid="nav-settings-panel"
    >
      <button
        v-for="preset in MOUSE_NAV_PRESETS"
        :key="preset.id"
        type="button"
        class="chrome__preset"
        :class="{ 'chrome__preset--on': settings.mouseNavPreset === preset.id }"
        :aria-pressed="settings.mouseNavPreset === preset.id"
        :data-testid="`nav-preset-${preset.id}`"
        @click="choosePreset(preset.id)"
      >
        {{ preset.label }}
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

.chrome__gear {
  flex: 0 0 auto;
  width: 30px;
  min-height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.chrome__gear[aria-expanded='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

/* Opens upward from the modes row so it never reaches toward the orientation
   gizmo (top-right) or grows the cluster's footprint while closed — the
   default state adds nothing to the chrome's on-screen size at all. */
.chrome__presets {
  position: absolute;
  left: 0;
  bottom: 100%;
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  min-width: 220px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.chrome__preset {
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.chrome__preset--on {
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

  .chrome__gear {
    min-height: 30px;
    width: 26px;
    font-size: 13px;
  }

  .chrome__presets {
    min-width: 200px;
  }

  .chrome__preset {
    min-height: 30px;
    font-size: 11px;
  }
}
</style>
