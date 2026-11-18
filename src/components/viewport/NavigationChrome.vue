<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Its aria-pressed buttons stay hand-built (ui-122): they are icon toggles in a floating cluster (and a preset picker), not a labelled single-choice row, so SegmentedToggle's radio model does not fit. -->
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
import { computed, ref, watch } from 'vue'

import BaseButton from '../controls/BaseButton.vue'
import IconButton from '../controls/IconButton.vue'
import { MOUSE_NAV_PRESETS, useSettingsStore } from '../../stores/settings.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'

/**
 * The chrome tier (`TODO/ui-084`): `compact` when the computed viewport pane is narrow (the
 * tablet's), from the layout store, never measured here. Compact is the existing ≤ 480px form;
 * the phone keeps that media query and reports `full`, so nothing changes below 641px.
 */
const panelLayout = usePanelLayoutStore()
const chromeTier = computed(() => panelLayout.layout.chromeTier)

const props = defineProps({
  dragMode: {
    type: /** @type {import('vue').PropType<'orbit' | 'pan' | 'select'>} */ (String),
    required: true,
  },
  /**
   * Whether the **Select** drag mode is offered (`TODO/io-016`). The Shared view shows someone
   * else's project with nothing selectable, so a mode that drags a selection box would be a
   * control that does nothing; it is left out there, and the rest of the pad is unchanged.
   */
  canSelect: { type: Boolean, default: true },
  /**
   * Whether the sketch editor is open (`TODO/sketch-001`).
   *
   * While it is, a plain drag *draws* rather than orbits or pans, so the drag-mode row
   * below would be selecting between three things none of which are happening — and the
   * mouse-nav preset beside it configures the very gesture that has been reclaimed. The
   * whole row is hidden for the duration rather than disabled, and the pad below pans.
   *
   * That is a deliberate departure from this project's usual disabled-not-hidden rule,
   * found by `ui-020`'s acceptance drive: at the 390px phone reference the chrome
   * cluster, the Sketch toolbar and an open sheet between them left the drawing area
   * almost entirely occluded. That rule exists for *operation* buttons, where "this
   * exists but needs operands" is information the user needs; a mode selector for a mode
   * you are not in is not that — the Sketch toolbar's Done and Cancel say exactly where
   * the gesture went, and the row comes straight back when the editor closes.
   *
   * There is no Sketch toggle here any more: a sketch is a primitive, entered from the
   * Library or from the Inspector's **Edit sketch**, never from navigation chrome.
   */
  sketching: { type: Boolean, default: false },
  /**
   * Whether an open phone-width sheet has pushed this cluster up off the bottom edge
   * (`TODO/ui-046`).
   *
   * Raised, the full cluster covered ~194×200px of live canvas at 390px, and a real
   * tap on a body underneath it pressed `nav-step-right` instead — silently orbiting
   * the camera, so every later tap aimed at that body's old position missed too.
   * While raised, and only at `≤640px` (the same breakpoint the raise itself lives
   * behind), the cluster collapses to one toggle in the corner and expands on a tap.
   * Two-finger pinch/pan and a one-finger drag keep working on the canvas meanwhile,
   * so collapsing costs discoverability for one tap, not the ability to navigate.
   */
  raised: { type: Boolean, default: false },
  /**
   * Whether the sketch editor's Slices/Extrude sheet is open (`TODO/sketch-001`). On a
   * narrow *viewport* (phone, and the tablet's 390px column) the cluster lifts above the
   * sheet — applied by a container query so it holds at tablet too. Separate from `raised`
   * on purpose: that one is gated on the window width, and widening it would change what
   * an open History dock does at tablet.
   */
  sketchSheet: { type: Boolean, default: false },
})

const emit = defineEmits(['step', 'zoom', 'mode', 'reset'])

// While sketching, a plain drag draws and the direction pad pans — orbit is
// suspended, so the pad must not claim to orbit either.
const verb = computed(() => (props.sketching || props.dragMode === 'pan' ? 'Pan' : 'Orbit'))

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

// TODO/ui-046: whether the user has opened the cluster while it is raised. Reset
// whenever the raise itself changes, so opening a sheet always starts collapsed —
// an expansion from a previous sheet must not come back covering a body the user
// has placed since.
const expanded = ref(false)

watch(
  () => [props.raised, props.sketching, props.sketchSheet],
  () => {
    expanded.value = false
  },
)

function toggleExpanded() {
  expanded.value = !expanded.value
  // The preset popover is anchored to the rows being hidden; it goes with them.
  if (!expanded.value) settingsOpen.value = false
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
  <div
    class="chrome"
    :class="{
      'chrome--raised': raised,
      'chrome--sketching': sketching,
      'chrome--sketch-sheet': sketchSheet,
      'chrome--expanded': expanded,
    }"
    data-testid="navigation-chrome"
    :data-drag-mode="dragMode"
    :data-chrome-tier="chromeTier"
  >
    <!-- The rows above the pad. `display: contents` everywhere except a
         collapsed raised phone cluster, where it is `display: none`
         (TODO/ui-046) — so wrapping them changes nothing about the column
         layout. The pad and zoom are hidden individually below, because the
         expand toggle shares their row. -->
    <div class="chrome__body">
      <div v-if="!sketching" class="chrome__modes" role="group" aria-label="Viewport drag mode">
        <BaseButton
          size="compact"
          class="chrome__mode"
          :variant="dragMode === 'orbit' ? 'primary' : 'default'"
          :aria-pressed="dragMode === 'orbit'"
          data-testid="nav-mode-orbit"
          title="Drag to orbit"
          @click="emit('mode', 'orbit')"
        >
          Orbit
        </BaseButton>
        <BaseButton
          size="compact"
          class="chrome__mode"
          :variant="dragMode === 'pan' ? 'primary' : 'default'"
          :aria-pressed="dragMode === 'pan'"
          data-testid="nav-mode-pan"
          title="Drag to pan"
          @click="emit('mode', 'pan')"
        >
          Pan
        </BaseButton>
        <BaseButton
          v-if="canSelect"
          size="compact"
          class="chrome__mode"
          :variant="dragMode === 'select' ? 'primary' : 'default'"
          :aria-pressed="dragMode === 'select'"
          data-testid="nav-mode-select"
          title="Drag a box to select several bodies (TODO/ui-024)"
          aria-label="Drag to select"
          @click="emit('mode', 'select')"
        >
          Select
        </BaseButton>
        <IconButton
          bordered
          size="compact"
          class="chrome__gear"
          label="Mouse navigation settings"
          :aria-expanded="settingsOpen"
          data-testid="nav-settings-gear"
          @click="toggleSettings"
        >
          ⚙
        </IconButton>
      </div>

      <div
        v-if="settingsOpen"
        class="chrome__presets"
        role="group"
        aria-label="Mouse navigation preset"
        data-testid="nav-settings-panel"
      >
        <BaseButton
          v-for="preset in MOUSE_NAV_PRESETS"
          :key="preset.id"
          size="compact"
          align="start"
          class="chrome__preset"
          :variant="settings.mouseNavPreset === preset.id ? 'primary' : 'default'"
          :aria-pressed="settings.mouseNavPreset === preset.id"
          :data-testid="`nav-preset-${preset.id}`"
          @click="choosePreset(preset.id)"
        >
          {{ preset.label }}
        </BaseButton>
      </div>
    </div>

    <div class="chrome__row">
      <!-- Only ever displayed at ≤640px while raised (TODO/ui-046). In the pad
           row, not a row of its own: a row would add ~44px of height to the
           expanded cluster, and `ui-043` measured the raised chrome with only
           ~6px to spare against the Operations toolbar above it. Bottom-aligned
           so it sits in the same corner collapsed and expanded — the second
           tap lands where the first did. -->
      <IconButton
        bordered
        size="compact"
        class="chrome__expand"
        :label="expanded ? 'Hide navigation controls' : 'Show navigation controls'"
        :aria-expanded="expanded"
        data-testid="nav-expand-toggle"
        @click="toggleExpanded"
      >
        <span aria-hidden="true">✥</span>
        <span class="chrome__expand-word" data-testid="nav-expand-word" aria-hidden="true">View</span>
      </IconButton>
      <div class="chrome__pad" role="group" :aria-label="`${verb} the camera`">
        <IconButton
          v-for="step in STEPS"
          :key="step.dir"
          bordered
          class="chrome__btn"
          :style="{ gridArea: step.cell }"
          :label="`${verb} camera ${step.dir}`"
          :data-testid="`nav-step-${step.dir}`"
          @click="emit('step', step.dir)"
        >
          {{ step.glyph }}
        </IconButton>
        <IconButton
          bordered
          class="chrome__btn chrome__btn--reset"
          style="grid-area: center"
          label="Reset camera position, zoom and orientation"
          data-testid="nav-reset"
          @click="emit('reset')"
        >
          ⌂
        </IconButton>
      </div>

      <div class="chrome__zoom" role="group" aria-label="Zoom">
        <IconButton bordered class="chrome__btn" label="Zoom in" data-testid="nav-zoom-in" @click="emit('zoom', 'in')">
          +
        </IconButton>
        <IconButton bordered class="chrome__btn" label="Zoom out" data-testid="nav-zoom-out" @click="emit('zoom', 'out')">
          −
        </IconButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chrome {
  position: absolute;
  left: calc(12px + var(--layout-safe-left));
  bottom: calc(12px + var(--layout-viewport-bottom-inset) + var(--layout-placement-chip-room));
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.chrome__body {
  display: contents;
}

/* The nav buttons are `IconButton` and `BaseButton`: the look (outline, fill, hover, focus ring) is
   theirs. What stays here is size and placement. The selected state of the toggles (the drag-mode
   and preset buttons use `variant="primary"`; the expand toggle and gear are `aria-expanded`) is the
   one look this file still names. */

/* Hidden everywhere except a raised phone cluster — see the media block below. */
.chrome .chrome__expand {
  display: none;
  font-size: var(--text-size-2xl);
  align-self: flex-end;
}

/* TODO/ui-128 #2: the ✥ glyph alone reads as "move"; the word says these are the view controls.
   The word sits under the glyph inside the same square: the folded cluster's width and height are
   budgeted to the pixel (ui-046's 60 px, the sketch editor's 69% reachable canvas), so the button
   must not grow. */
.chrome .chrome__expand {
  grid-auto-flow: row;
  align-content: center;
  justify-items: center;
  gap: 0;
  padding: 0;
  line-height: 1;
}

.chrome__expand-word {
  font-size: var(--text-size-2xs);
  font-weight: var(--font-weight-1);
}

.chrome .chrome__expand[aria-expanded='true'],
.chrome .chrome__gear[aria-expanded='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.chrome__modes {
  display: flex;
  gap: var(--space-2);
}

.chrome .chrome__mode {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  padding: 0 var(--space-4h);
  font-size: var(--text-size-sm);
}

.chrome .chrome__gear {
  flex: 0 0 auto;
  width: 30px;
  height: auto;
  min-height: 32px;
  font-size: var(--text-size-lg);
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
  gap: var(--space-2);
  padding: var(--space-3);
  min-width: 220px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.chrome .chrome__preset {
  min-height: var(--tap);
  padding: 0 var(--space-4h);
  font-size: var(--text-size-sm);
}

.chrome__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.chrome__pad {
  display: grid;
  grid-template-areas:
    '. up .'
    'left center right'
    '. down .';
  gap: var(--space-1);
}

.chrome__zoom {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.chrome .chrome__btn {
  font-size: var(--text-size-lg);
  line-height: 1;
}

.chrome .chrome__btn--reset {
  font-size: var(--text-size-xl);
}

/* The compact form (`TODO/ui-084`): the ≤ 480px rules below, keyed on the chrome tier as well, so
   the tablet's narrow pane gets them too. Every control, test id, title and `aria-label` stays; the
   `ui-046` fold stays phone-only. Keep this block and the media block in step. */
.chrome[data-chrome-tier='compact'] {
  left: calc(8px + var(--layout-safe-left));
  bottom: calc(8px + var(--layout-viewport-bottom-inset) + var(--layout-placement-chip-room));
  padding: var(--space-2);
}

.chrome[data-chrome-tier='compact'] .chrome__btn {
  width: var(--tap-compact);
  height: var(--tap-compact);
}

.chrome[data-chrome-tier='compact'] .chrome__mode {
  min-height: 30px;
  font-size: var(--text-size-xs);
}

.chrome[data-chrome-tier='compact'] .chrome__gear {
  min-height: 30px;
  width: 26px;
  font-size: var(--text-size-md);
}

.chrome[data-chrome-tier='compact'] .chrome__presets {
  min-width: 200px;
}

.chrome[data-chrome-tier='compact'] .chrome__preset {
  min-height: 30px;
  font-size: var(--text-size-xs);
}

@media (max-width: 480px) {
  .chrome {
    left: calc(8px + var(--layout-safe-left));
    bottom: calc(8px + var(--layout-viewport-bottom-inset) + var(--layout-placement-chip-room));
    padding: var(--space-2);
  }

  .chrome .chrome__btn {
    /* Still a comfortable target at 390px width — the whole cluster is
       38×3 + 38 + gaps ≈ 162px, so nothing reflows off-screen and the page
       never scrolls horizontally. */
    width: var(--tap-compact);
    height: var(--tap-compact);
  }

  .chrome .chrome__mode {
    min-height: 30px;
    font-size: var(--text-size-xs);
  }

  .chrome .chrome__gear {
    min-height: 30px;
    width: 26px;
    font-size: var(--text-size-md);
  }

  .chrome__presets {
    min-width: 200px;
  }

  .chrome .chrome__preset {
    min-height: 30px;
    font-size: var(--text-size-xs);
  }
}

/* TODO/ui-046. 640px, not the 480px above: this follows `AppView.vue`'s own
   `--layout-viewport-bottom-inset` breakpoint, which is where the raise itself happens.
   Collapsed, the cluster is one 38px toggle plus its padding (~48px square)
   instead of ~194×200px sitting over whatever body the user placed there. */
/* TODO/sketch-001: while the sketch editor is open on a narrow viewport the cluster folds
   to its one toggle — ui-046's fold, for the same reason: the drawing plane needs the room
   (it keeps the resting editor's reachable canvas above ui-020's 69% at the 390px phone),
   and two-finger pan/pinch and the expanded toggle still navigate. With a Slices/Extrude
   sheet open it also lifts above that sheet (capped at 24% by `SketchPanelSheet.vue`). */
@container viewport (max-width: 520px) {
  .chrome--sketching .chrome__expand {
    display: grid;
  }

  .chrome--sketching:not(.chrome--expanded) .chrome__body,
  .chrome--sketching:not(.chrome--expanded) .chrome__pad,
  .chrome--sketching:not(.chrome--expanded) .chrome__zoom {
    display: none;
  }

  .chrome--sketch-sheet {
    bottom: calc(8px + var(--layout-viewport-bottom-inset) + var(--layout-placement-chip-room) + 24%);
  }
}

/* TODO/ui-124. The tablet form (641px and up) can leave the canvas too narrow for the expanded
   pad (193px, left) and the grid scale readout (163px, right) side by side: they overlapped by
   ~10px at a 650px window. Under 380px of canvas the cluster folds to its one toggle, the form the
   phone's raised cluster uses, and a tap expands it. A container query, not a window `@media`: it is
   the canvas that is short of room, and the Inspector and Library tracks move with the window.
   Below 641px the rules above already own the phone. */
@media (min-width: 641px) {
  @container viewport (max-width: 380px) {
    .chrome .chrome__expand {
      display: grid;
    }

    .chrome:not(.chrome--expanded) .chrome__body,
    .chrome:not(.chrome--expanded) .chrome__pad,
    .chrome:not(.chrome--expanded) .chrome__zoom {
      display: none;
    }
  }
}

@media (max-width: 640px) {
  .chrome--raised .chrome__expand {
    display: grid;
  }

  .chrome--raised:not(.chrome--expanded) .chrome__body,
  .chrome--raised:not(.chrome--expanded) .chrome__pad,
  .chrome--raised:not(.chrome--expanded) .chrome__zoom {
    display: none;
  }
}
</style>
