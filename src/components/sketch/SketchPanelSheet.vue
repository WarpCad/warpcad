<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * Where the Slices and Extrude panels open (`TODO/sketch-001`).
 *
 * On a narrow viewport — the 390px phone, and the tablet, whose viewport column is also
 * 390px wide — a **bottom sheet** inside the viewport, reusing the Inspector sheet's
 * pattern. It is capped low enough that the active slice's drawing area stays reachable
 * (ui-020 finding #3's ≥ 69% reachable-canvas rule), and the nav chrome folds above it
 * (ui-046) while the toolbar's Done and Cancel stay visible at the top. On a wide
 * viewport it is a card docked bottom-right, clear of the nav chrome bottom-left.
 *
 * One panel at a time, chosen by the toolbar — Slices, Extrude, or Curve (`TODO/sketch-008`). While Set scale is armed the sheet folds to
 * its header — and on a narrow viewport steps aside entirely (`TODO/sketch-003`).
 */
import HelpButton from '../controls/HelpButton.vue'
import IconButton from '../controls/IconButton.vue'
import CurveSheet from './CurveSheet.vue'
import ExtrudePanel from './ExtrudePanel.vue'
import SlicePanel from './SlicePanel.vue'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const editor = useSketchEditorStore()
const emit = defineEmits(['activate-slice'])

/** @type {Record<string, string>} */
const TITLES = Object.freeze({ slices: 'Slices', extrude: 'Extrude', curve: 'Curve' })
</script>

<template>
  <section
    v-if="editor.panel"
    class="sketch-sheet"
    data-testid="sketch-panel-sheet"
    :data-panel="editor.panel"
    :data-collapsed="editor.imageTool !== '' ? 'true' : 'false'"
    :aria-label="TITLES[editor.panel]"
  >
    <header class="sketch-sheet__head">
      <h3 class="sketch-sheet__title">{{ TITLES[editor.panel] }}</h3>
      <HelpButton :topic="editor.panel" class="sketch-sheet__help" />
      <IconButton
        label="Close panel"
        variant="quiet"
        size="compact"
        class="sketch-sheet__close"
        data-testid="sketch-panel-close"
        @click="editor.togglePanel(editor.panel)"
      >
        ×
      </IconButton>
    </header>
    <!-- While Set scale is armed the sheet collapses to its header (`TODO/sketch-003`), so the
         photo under it stays tappable — the reachable-canvas rule on a phone. -->
    <div v-show="editor.imageTool === ''" class="sketch-sheet__body">
      <SlicePanel v-if="editor.panel === 'slices'" @activate="emit('activate-slice', $event)" />
      <CurveSheet v-else-if="editor.panel === 'curve'" />
      <ExtrudePanel v-else />
    </div>
  </section>
</template>

<style scoped>
.sketch-sheet {
  position: absolute;
  right: 12px;
  bottom: calc(12px + var(--layout-viewport-bottom-inset));
  width: min(320px, calc(100% - 24px));
  max-height: 45%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  z-index: calc(var(--z-panel) + 3);
}

.sketch-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 0 12px;
}

.sketch-sheet__help {
  margin: -3px 0 -3px auto;
}

.sketch-sheet__title {
  margin: 0;
  font-size: var(--text-size-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

/* Layout only: the cross is a typeset glyph, larger than the icon default. */
.sketch-sheet__close {
  font-size: var(--text-size-display);
}

.sketch-sheet__body {
  overflow-y: auto;
  padding: 4px 12px 12px;
}

/* Narrow viewport: a full-width bottom sheet, capped at 24% of the viewport so the drawing
   area around the sketch origin (the view centre) stays reachable with it open — asserted
   on the 10×10 hit grid in e2e/sketch-primitive.e2e.js. */
@container viewport (max-width: 520px) {
  .sketch-sheet {
    left: 0;
    right: 0;
    bottom: var(--layout-viewport-bottom-inset);
    width: auto;
    max-height: 24%;
    /* Opaque at this size: the grid readout and the chrome sit right behind it, and a
       glass sheet let them show through as clutter. */
    background: var(--surface-1);
    backdrop-filter: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
  }

  /* Set scale armed (`TODO/sketch-003`): on a narrow viewport even the folded header is a row
     of the 10×10 reachability grid the photo needs (67 % measured with it, against the 69 %
     floor), so the sheet steps aside entirely; the banner's Cancel brings it back. */
  .sketch-sheet[data-collapsed='true'] {
    display: none;
  }
}
</style>
