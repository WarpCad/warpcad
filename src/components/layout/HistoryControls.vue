<script setup>
/**
 * The header bar's Undo / Redo pair (`TODO/data-003`).
 *
 * **Why the header and not the toolbar.** `data-003`'s own Interaction model
 * guessed "two small buttons in the existing toolbar chrome"; that guess is
 * superseded by `docs/decisions/interaction-model-qa.md`'s cross-cutting
 * "document bar" decision, confirmed by the user: Undo, Redo, History and File ▾
 * are document-level, not selection-gated, so they belong in none of the three
 * viewport clusters. The Operations toolbar in particular has hit its width
 * limit twice already, with real cross-engine regressions each time
 * (`ui-015`/`ui-027`'s retirement notes) — the header is the one strip that is
 * always visible and overlaps no viewport control.
 *
 * This component owns only Undo and Redo. The History toggle (`ui-032`), the
 * File menu (`ui-033`/`ui-034`) and the save-status chip (`io-001`) are the rest
 * of that cluster and are deliberately not built here; the header's
 * right-aligned slot is sized so they land beside these two without a reflow.
 *
 * **Enablement is stack depth, not selection.** Every other control in this app
 * gates on selection count; these two gate on whether there is anything to undo,
 * which is why the precondition is "nothing selected" — they act on the
 * document's history, not on what is highlighted. One further gate is specified
 * but not yet buildable: section 19 disables both while a timeline *preview* is
 * active, because the viewport is then showing a past state rather than the
 * document. No preview state exists until `ui-032` builds the timeline panel, so
 * there is nothing to read here yet — that task adds the condition to
 * `disabled`, rather than this one inventing a flag nothing sets.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import { useTimelineStore } from '../../stores/timeline.js'

const documentStore = useDocumentStore()
const timeline = useTimelineStore()

/**
 * §14, point 3: while previewing, "Undo/Redo" are disabled along with
 * everything else that would mutate the document. The viewport is not the
 * document during a preview, so a button that acted on the document while
 * pointing at a past state would be the looks-live-but-isn't defect this whole
 * milestone is built against.
 */
const undoDisabled = computed(() => !documentStore.canUndo || timeline.previewing)
const redoDisabled = computed(() => !documentStore.canRedo || timeline.previewing)

/**
 * The refusal from the last attempt, if it was refused.
 *
 * Section 19, point 4: undoing a local step that a remote step depends on is
 * refused *by name* rather than deleting someone else's work. Nothing in the app
 * can produce a non-local record today — there is no MCP surface and no hosted
 * pull — so this region is unreachable in practice until `io-002` exists; it is
 * wired now because the alternative is a `catch` that swallows the message, and
 * "never silent" is the rule. `ui-033`'s shared `save-status` chip is where this
 * belongs once that one status surface exists.
 */
const refusal = ref('')

/** @param {'undo' | 'redo'} action */
function run(action) {
  const result = action === 'undo' ? documentStore.undo() : documentStore.redo()
  refusal.value = result.ok ? '' : (result.message ?? '')
}

/**
 * Whether a keystroke landed in something that does its own undo.
 *
 * The Inspector is full of numeric fields, and a global Ctrl+Z that ate the
 * browser's own field-level undo would make typing a dimension worse to fix than
 * it is to get wrong — the cross-cutting shortcut table calls this out by name.
 *
 * @param {EventTarget | null} target
 */
function isTextEntry(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y — additive to the buttons, never
 * instead of them (CLAUDE.md's touch-device rule: a phone has no Ctrl key, which
 * is exactly why the on-screen pair above is the primary path).
 *
 * @param {KeyboardEvent} event
 */
function onKeydown(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (isTextEntry(event.target)) return
  const key = event.key.toLowerCase()
  let action = null
  if (key === 'z') action = event.shiftKey ? 'redo' : 'undo'
  else if (key === 'y' && !event.shiftKey) action = 'redo'
  if (!action) return
  if (action === 'undo' ? undoDisabled.value : redoDisabled.value) return
  event.preventDefault()
  run(/** @type {'undo' | 'redo'} */ (action))
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="history" data-testid="history-controls">
    <button
      type="button"
      class="history__button"
      data-testid="undo-button"
      :disabled="undoDisabled"
      :title="
        timeline.previewing
          ? 'Leave the preview to undo'
          : documentStore.canUndo
            ? `Undo: ${documentStore.undoLabel}`
            : 'Nothing to undo'
      "
      :aria-label="
        timeline.previewing
          ? 'Leave the preview to undo'
          : documentStore.canUndo
            ? `Undo: ${documentStore.undoLabel}`
            : 'Nothing to undo'
      "
      :data-undo-label="documentStore.undoLabel"
      @click="run('undo')"
    >
      <!-- A drawn glyph rather than a text label: at 390px the header has room
           for a 44px tap target, not for the word "Undo" beside three more
           controls. The accessible name above is what a screen reader gets, and
           it names the action, not just the verb. -->
      <span aria-hidden="true">↶</span>
    </button>
    <button
      type="button"
      class="history__button"
      data-testid="redo-button"
      :disabled="redoDisabled"
      :title="
        timeline.previewing
          ? 'Leave the preview to redo'
          : documentStore.canRedo
            ? `Redo: ${documentStore.redoLabel}`
            : 'Nothing to redo'
      "
      :aria-label="
        timeline.previewing
          ? 'Leave the preview to redo'
          : documentStore.canRedo
            ? `Redo: ${documentStore.redoLabel}`
            : 'Nothing to redo'
      "
      :data-redo-label="documentStore.redoLabel"
      @click="run('redo')"
    >
      <span aria-hidden="true">↷</span>
    </button>
    <p v-if="refusal" class="history__refusal" role="alert" data-testid="history-refusal">
      {{ refusal }}
    </p>
  </div>
</template>

<style scoped>
.history {
  display: flex;
  align-items: center;
  gap: 4px;
}

.history__button {
  /* 44px at every width, per the cross-cutting phone budget — a header control
     that shrinks below the tap target on the one device with no keyboard
     shortcut would fail CLAUDE.md's Responsive Layout rule outright. */
  width: var(--tap);
  height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.history__button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.history__button:disabled {
  opacity: 0.4;
  cursor: default;
}

.history__refusal {
  margin: 0;
  max-width: 240px;
  font-size: 11px;
  color: var(--danger);
}
</style>
