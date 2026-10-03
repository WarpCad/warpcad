<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Sketch toolbar — mounted only while the sketch editor is open (`TODO/sketch-001`).
 *
 * It claims the viewport's **single top-left toolbar slot**, which is why `Viewport.vue`
 * hides the Operations toolbar for the duration — the arrangement ui-020 found was the
 * only one that cleared the orientation gizmo at the 390px phone and tablet viewports.
 *
 * ## Why the tool list is hardcoded and not read from a registry
 *
 * CLAUDE.md's creation-vs-operation rule is about exactly this instinct. A sketch tool is
 * drawing-specific chrome, not a row that belongs beside Cube in the Library, and
 * "register a tool and let a generic list render it" is how the first attempt shipped a
 * menu that dumped every registered feature into one dropdown. Each tool here is named,
 * deliberately.
 *
 * Contents, in order: **Select** (an arrow — it never draws) and the four drawing tools;
 * the **Hole** toggle and **Delete** (a trash can) for the selected outline, both disabled
 * until exactly one outline is picked (`TODO/sketch-005`) — Delete removes the picked
 * *point* instead when one is picked (`TODO/sketch-002`); **Slices** and **Extrude ▾**, which open their panels (a bottom sheet on a
 * narrow viewport); **Done** and **Cancel**. Done is disabled with its reason printed
 * underneath whenever the draft can't be built — the document never holds a body the
 * kernel can't build.
 */
import { computed } from 'vue'

import { useSketchEditorCommands } from '../../composables/useSketchEditorCommands.js'
import { SKETCH_TOOLS, useSketchEditorStore } from '../../stores/sketchEditor.js'
import { isClosed } from '../../sketch/profile.js'

const editor = useSketchEditorStore()
const commands = useSketchEditorCommands()

/** @type {Record<string, { glyph: string, label: string, hint: string }>} */
const TOOL_INFO = Object.freeze({
  select: { glyph: '', label: 'Select', hint: 'Tap an outline to pick it, then change or delete it; tap empty canvas to clear. Never draws' },
  line: { glyph: '╱', label: 'Line', hint: 'Click or tap to add points — each one starts the next segment; click the first point to close; Finish or Esc leaves it open' },
  rect: { glyph: '▭', label: 'Rectangle', hint: 'Drag from one corner to the opposite corner' },
  circle: { glyph: '◯', label: 'Circle', hint: 'Drag from the centre out to the rim' },
  polygon: { glyph: '⬡', label: 'Polygon', hint: 'Drag from the centre out to a corner' },
})

const METHOD_LABELS = Object.freeze({ linear: 'Linear', revolve: 'Revolve', helical: 'Helical', outline: 'Outline', loft: 'Loft' })

const selected = computed(() => editor.selectedProfile)
const isHole = computed(() => selected.value?.role === 'hole')
const openCount = computed(
  () => editor.slice?.profiles.filter((profile) => profile.kind === 'polyline' && !isClosed(profile)).length ?? 0,
)

/** The status line: why Done is off, why the last Done failed, or a note about open outlines. */
const status = computed(() => {
  if (editor.commitError) return { tone: 'error', text: editor.commitError }
  if (editor.doneProblem) return { tone: 'warn', text: editor.doneProblem }
  if (openCount.value > 0) return { tone: 'warn', text: 'Open outline — not part of the solid' }
  if (editor.previewStatus === 'building') return { tone: 'info', text: 'Building preview…' }
  return { tone: 'info', text: '' }
})

/**
 * The Delete button's tooltip. With a point picked it deletes the **point** (`TODO/sketch-002`),
 * and when that is refused the reason is the whole tooltip, word for word.
 */
const deleteTitle = computed(() => {
  if (!selected.value) return 'Pick an outline with Select first, then delete it'
  if (editor.deleteProblem) return editor.deleteProblem
  if (editor.deleteTarget === 'vertex') return 'Delete the picked point (Delete or Backspace)'
  return 'Delete the selected outline (Delete or Backspace)'
})

function toggleHole() {
  if (!selected.value) return
  editor.setSelectedRole(isHole.value ? 'solid' : 'hole')
}

/** @param {Event} event */
function onSides(event) {
  const value = Math.round(Number(/** @type {HTMLInputElement} */ (event.target).value))
  if (Number.isFinite(value) && value >= 3 && value <= 64) editor.polygonSides = value
}
</script>

<template>
  <div
    class="sketch-toolbar"
    data-testid="sketch-toolbar"
    :data-tool="editor.tool"
    :data-slice-count="editor.draft.slices.length"
    :data-method="editor.draft.extrusion.method"
  >
    <div class="sketch-toolbar__row">
      <div class="sketch-toolbar__group" role="group" aria-label="Sketch tools">
        <button
          v-for="tool in SKETCH_TOOLS"
          :key="tool"
          type="button"
          class="sketch-toolbar__btn sketch-toolbar__btn--tool"
          :class="{ 'sketch-toolbar__btn--on': editor.tool === tool }"
          :aria-pressed="editor.tool === tool"
          :aria-label="TOOL_INFO[tool].label"
          :title="`${TOOL_INFO[tool].label} — ${TOOL_INFO[tool].hint}`"
          :data-testid="`sketch-tool-${tool}`"
          @click="editor.setTool(tool)"
        >
          <svg v-if="tool === 'select'" class="sketch-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3 L5 19 L9.2 15 L12 21.5 L14.6 20.3 L11.8 14 L17.5 14 Z" />
          </svg>
          <template v-else>{{ TOOL_INFO[tool].glyph }}</template>
        </button>
        <input
          v-if="editor.tool === 'polygon'"
          class="sketch-toolbar__sides"
          type="number"
          min="3"
          max="64"
          step="1"
          inputmode="numeric"
          aria-label="Polygon sides"
          title="How many sides the next polygon gets"
          data-testid="sketch-polygon-sides"
          :value="editor.polygonSides"
          @change="onSides"
        />
      </div>

      <button
        type="button"
        class="sketch-toolbar__btn"
        :class="{ 'sketch-toolbar__btn--on': isHole }"
        :aria-pressed="isHole"
        :disabled="!selected"
        :title="selected ? 'Mark the selected outline as a Hole (or back to Solid)' : 'Tap an outline first, then mark it as a Hole'"
        data-testid="sketch-role-toggle"
        :data-role="selected?.role ?? ''"
        @click="toggleHole"
      >
        Hole
      </button>

      <button
        type="button"
        class="sketch-toolbar__btn sketch-toolbar__btn--icon"
        :disabled="!selected || Boolean(editor.deleteProblem)"
        :aria-label="editor.deleteTarget === 'vertex' ? 'Delete vertex' : 'Delete outline'"
        :title="deleteTitle"
        data-testid="sketch-delete"
        :data-target="editor.deleteTarget"
        @click="editor.deleteSelection()"
      >
        <svg class="sketch-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7 H20 M9 7 V4.5 H15 V7 M6.5 7 L7.5 20 H16.5 L17.5 7 M10 10.5 V16.5 M14 10.5 V16.5" />
        </svg>
      </button>

      <button
        type="button"
        class="sketch-toolbar__btn"
        :class="{ 'sketch-toolbar__btn--open': editor.panel === 'slices' }"
        :aria-expanded="editor.panel === 'slices'"
        title="Slices: add more outlines at other heights, for a Loft"
        data-testid="sketch-slices-toggle"
        @click="editor.togglePanel('slices')"
      >
        Slices {{ editor.draft.slices.length }}
      </button>
      <button
        type="button"
        class="sketch-toolbar__btn"
        :class="{ 'sketch-toolbar__btn--open': editor.panel === 'extrude' }"
        :aria-expanded="editor.panel === 'extrude'"
        title="How the outlines become a solid"
        data-testid="sketch-extrude-toggle"
        @click="editor.togglePanel('extrude')"
      >
        {{ METHOD_LABELS[editor.draft.extrusion.method] }} ▾
      </button>

      <button
        type="button"
        class="sketch-toolbar__btn sketch-toolbar__btn--done"
        :disabled="Boolean(editor.doneProblem)"
        :title="editor.doneProblem || 'Finish the sketch and make the solid'"
        data-testid="sketch-done"
        @click="commands.done()"
      >
        Done
      </button>
      <button
        type="button"
        class="sketch-toolbar__btn"
        title="Discard every change since the editor opened"
        data-testid="sketch-cancel"
        @click="commands.cancel()"
      >
        Cancel
      </button>
    </div>
    <div v-if="editor.chainLive" class="sketch-toolbar__row sketch-toolbar__row--chain" data-testid="sketch-chain-row">
      <button
        type="button"
        class="sketch-toolbar__btn sketch-toolbar__btn--chain"
        title="Finish the line and leave it open (Esc or Enter)"
        data-testid="sketch-line-finish"
        @click="editor.finishChain()"
      >
        Finish
      </button>
      <button
        type="button"
        class="sketch-toolbar__btn sketch-toolbar__btn--chain"
        title="Remove the last point (Backspace)"
        data-testid="sketch-line-undo"
        @click="editor.undoPoint()"
      >
        Undo point
      </button>
    </div>
    <p v-if="editor.chainLive && editor.tool === 'line'" class="sketch-toolbar__status sketch-toolbar__status--info" data-testid="sketch-chain-hint" role="status">
      Click to add a point · Esc to finish · click the first point to close
    </p>
    <p v-if="editor.selectionStatus" class="sketch-toolbar__selection" data-testid="sketch-selection-status" role="status">
      {{ editor.selectionStatus }}
    </p>
    <p
      v-if="status.text"
      class="sketch-toolbar__status"
      :class="`sketch-toolbar__status--${status.tone}`"
      data-testid="sketch-status"
      role="status"
    >
      {{ status.text }}
    </p>
  </div>
</template>

<style scoped>
/* The viewport's top-left toolbar slot, the one the Operations toolbar occupies the rest
   of the time. Anchored left so it clears the orientation gizmo in the top-right corner
   at every width by construction (ui-020's acceptance drive killed a centred bar). */
.sketch-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  max-width: calc(100% - 24px - 150px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  z-index: 12;
}

.sketch-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.sketch-toolbar__group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.sketch-toolbar__btn {
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.sketch-toolbar__btn--tool {
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.sketch-toolbar__icon {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  vertical-align: middle;
}

/* The arrow is a solid shape, not a line drawing. */
.sketch-toolbar__btn--tool .sketch-toolbar__icon {
  fill: currentColor;
}

.sketch-toolbar__btn--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.sketch-toolbar__btn--open {
  border-color: var(--accent);
  color: var(--accent);
}

.sketch-toolbar__btn--done:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.sketch-toolbar__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sketch-toolbar__btn:hover:not(:disabled),
.sketch-toolbar__btn:focus-visible {
  border-color: var(--accent);
  outline: none;
}

.sketch-toolbar__sides {
  width: 52px;
  min-height: var(--tap);
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 13px;
}

.sketch-toolbar__status {
  margin: 0;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}

.sketch-toolbar__selection {
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.35;
  font-weight: 600;
  color: var(--accent);
}

.sketch-toolbar__status--warn {
  color: var(--warn);
}

.sketch-toolbar__status--error {
  color: var(--danger, var(--warn));
}

/* A narrow viewport — the 390px phone, and the tablet, whose viewport column is also
   390px wide (ui-020 finding #2): smaller type, never a shrunken tap target. The bar
   wraps to two rows; the orientation gizmo's corner stays clear. */
@container viewport (max-width: 520px) {
  .sketch-toolbar {
    top: 8px;
    left: 8px;
    gap: 2px;
    padding: 4px 6px;
    /* The orientation gizmo sizes itself by the *window*, so at the tablet reference it is
       still its full ~130px inside a 390px viewport — leave room for that one. */
    max-width: calc(100% - 16px - 150px);
  }

  .sketch-toolbar__row {
    gap: 4px;
  }

  .sketch-toolbar__btn {
    min-height: var(--tap-compact);
    min-width: var(--tap-compact);
    padding: 0 7px;
    font-size: 11px;
  }

  .sketch-toolbar__btn--tool {
    padding: 0;
    font-size: 16px;
  }

  /* Select and Delete are the two controls a finger needs most and a keyboard cannot
     stand in for, so they keep the full 44 px target the rest of the row gives up. */
  .sketch-toolbar__btn[data-testid='sketch-tool-select'],
  .sketch-toolbar__btn[data-testid='sketch-delete'],
  .sketch-toolbar__btn--chain {
    min-height: var(--tap);
    min-width: var(--tap);
  }

  .sketch-toolbar__sides {
    min-height: var(--tap-compact);
    width: 46px;
  }
}

/* A phone window: the gizmo is its compact size too, so the bar may use more of the row. */
@media (max-width: 480px) {
  .sketch-toolbar {
    max-width: calc(100% - 16px - 120px);
  }
}
</style>
