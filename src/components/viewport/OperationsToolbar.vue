<script setup>
/**
 * The Operations toolbar: Union, Subtract, Intersect (`TODO/ui-014`) and Group
 * (`TODO/ui-015`).
 *
 * This control exists in this shape because of a rule CLAUDE.md calls
 * non-negotiable:
 *
 * > Creation and operation are never the same list. [...] An operation control is
 * > disabled or hidden until its required operands are actually selected.
 *
 * So these three buttons are deliberately **not** rows in the Library panel
 * beside Cube and Cylinder, and deliberately not a dropdown built by iterating
 * the registry — the previous attempt's boolean menu was exactly that, and it
 * offered every registered feature type as if they were interchangeable. An
 * operation is a different kind of thing from a creation, it has a precondition,
 * and the control has to say so before it is pressed rather than failing after.
 *
 * Two things follow from that and are the whole behaviour here:
 *
 * 1. **Enablement is gated on selection _count_, not presence.** Fewer than two
 *    solids and all three buttons are disabled, with a live "N selected" badge so
 *    the requirement is legible *before* it is met rather than only after.
 * 2. **Order is part of the operand set, not just membership.** Subtract's base
 *    is the solid picked first; everything picked after it is removed from that.
 *    The badge says so in words, and `Viewport.vue` paints the base and the rest
 *    in two different colours so the same fact reads off the scene itself
 *    (`TODO/ACCEPTANCE.md` scenario 4, step 4).
 *
 * The record it appends names operands by `document.currentIdOf(...)`, never by
 * the selection's own ids. A selection holds *lineage root* ids, which stay
 * stable across a move — but the root's entry in the evaluated scene still holds
 * the geometry the body had when it was first placed. Subtracting that would cut
 * a hole where the body used to be, which is exactly the class of bug that looks
 * fine until someone drags something first.
 */
import { computed } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

const documentStore = useDocumentStore()
const selection = useSelectionStore()

/**
 * The three operations, in the order §6 lists them. Each carries the label its
 * result is named with, so a merged body reads as "Union 1" in the scene list
 * rather than inheriting a name from whichever operand happened to be first.
 *
 * @type {ReadonlyArray<{ op: string, label: string, glyph: string, hint: string }>}
 */
const OPERATIONS = Object.freeze([
  {
    op: 'boolean.union',
    label: 'Union',
    glyph: '∪',
    hint: 'Merge the selected solids into one',
  },
  {
    op: 'boolean.subtract',
    label: 'Subtract',
    glyph: '−',
    hint: 'Remove every later-selected solid from the first',
  },
  {
    op: 'boolean.intersect',
    label: 'Intersect',
    glyph: '∩',
    hint: 'Keep only the volume the selected solids share',
  },
  {
    op: 'group.assemble',
    label: 'Group',
    glyph: '⊞',
    hint: "Combine into one selectable body — each solid's own geometry stays intact",
  },
])

/** The precondition, stated once. CLAUDE.md gates on count, not presence. */
const MINIMUM_OPERANDS = 2

const disabled = computed(() => selection.count < MINIMUM_OPERANDS)

/** What a disabled button says when hovered or long-pressed. */
const DISABLED_HINT = `Select ${MINIMUM_OPERANDS} or more solids`

/**
 * @param {{ label: string, hint: string }} operation
 * @returns {string}
 */
function titleFor(operation) {
  return disabled.value ? DISABLED_HINT : `${operation.label} — ${operation.hint}`
}

/**
 * Run one operation over the current selection.
 *
 * @param {string} op Registry key, e.g. `'boolean.union'`.
 * @param {string} label Human label, used to name the result.
 * @returns {void}
 */
function run(op, label) {
  if (disabled.value) return

  // Resolve every selected body to the record that currently represents it —
  // see the module note above on why the raw selection ids are the wrong thing
  // to hand the kernel as `target`/`operands`.
  const operandIds = selection.ids.map((id) => documentStore.raw.currentIdOf(id) ?? id)
  const [base, ...rest] = operandIds
  const id = documentStore.raw.nextId(op === 'group.assemble' ? 'group' : 'bool')

  /** @type {import('../../core/kernel/registry.js').OpRecord} */
  const record = {
    id,
    op,
    name: documentStore.raw.nextName(label),
    // `target` before `operands` is the fold's own input order, so the
    // first-selected solid lands at `inputs[0]` — which is what makes it
    // Subtract's minuend without this component knowing any kernel maths.
    target: base,
    operands: rest,
    consumes: operandIds,
  }

  // `group.assemble` (TODO/ui-015) needs one display name per operand, so the
  // resulting Group's parts are addressable by name rather than by opaque
  // record id (the breadcrumb `ui-016` builds later). Looked up by
  // **`selection.ids`**, not by `operandIds` above: `documentStore.bodies` keys
  // each summary by its *lineage root* id, while `operandIds` holds each
  // operand's *terminal* record id — the two only coincide for a body that has
  // never been superseded (moved). Looking up by the terminal id would silently
  // miss every moved operand and fall back to its opaque record id instead of
  // its real name.
  if (op === 'group.assemble') {
    record.params = {
      names: selection.ids.map((rootId) => {
        const body = documentStore.bodies.find((candidate) => candidate.id === rootId)
        return body?.name ?? rootId
      }),
    }
  }

  documentStore.append(record, { origin: 'local' })

  // The operands are gone as independent bodies, so leaving them selected would
  // point the Inspector and the gizmo at things that are no longer on screen.
  // Selecting the result instead hands it straight to the ordinary
  // selection → inspector → gizmo contract with no special case.
  selection.select(id)
}
</script>

<template>
  <div
    class="ops"
    data-testid="operations-toolbar"
    :data-enabled="disabled ? 'false' : 'true'"
    :data-selected-count="selection.count"
    role="group"
    aria-label="Boolean and group operations"
  >
    <p class="ops__badge" data-testid="operations-count">
      <span class="ops__count">{{ selection.count }} selected</span>
      <!-- The base/subtrahend relationship in words, alongside the two colours
           the scene paints it in. A user who has not read the docs still has to
           be able to tell which solid Subtract is going to cut. -->
      <span v-if="!disabled" class="ops__legend" data-testid="operations-legend">
        <span class="ops__swatch ops__swatch--base" aria-hidden="true" />first is the base
      </span>
      <span v-else class="ops__legend">{{ DISABLED_HINT.toLowerCase() }}</span>
    </p>

    <div class="ops__row">
      <button
        v-for="operation in OPERATIONS"
        :key="operation.op"
        type="button"
        class="ops__btn"
        :disabled="disabled"
        :data-testid="`operation-${operation.label.toLowerCase()}`"
        :data-op="operation.op"
        :title="titleFor(operation)"
        :aria-label="titleFor(operation)"
        @click="run(operation.op, operation.label)"
      >
        <span class="ops__glyph" aria-hidden="true">{{ operation.glyph }}</span>
        <span class="ops__label">{{ operation.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * Top-left of the viewport, which is the one corner none of the other viewport
 * chrome claims: navigation is bottom-left, the scale readout bottom-right, the
 * orientation gizmo top-right. It stays clear of the phone-width Library and
 * Inspector bottom sheets outright rather than by arithmetic, which matters here
 * because this toolbar's *enabled state* is what the user is watching while they
 * pick the second solid — a control that only becomes visible once the sheets
 * are dismissed would be telling them nothing at the moment they need it.
 *
 * `max-width` below is relative to `.viewport` (this component's containing
 * block, `position: relative` in `Viewport.vue`) rather than the page, and
 * that distinction is load-bearing (found by `TODO/ui-015`'s own e2e run, not
 * designed up front): at tablet width the persistent Library and Inspector side
 * panels leave the 3D viewport *pane* itself far narrower than the page (measured
 * ~390px against an 820px page), so the page-width phone breakpoint below never
 * sees the problem. Adding this fourth button pushed the row's natural width
 * (~326px) far enough right to physically overlap the orientation gizmo's own
 * dial — not just its outer box, its clickable view caps — which a Playwright
 * click then reports as "intercepted", not merely a cosmetic overlap. `184px`
 * is the gizmo's own container width (130px) plus its `right: 12px` inset plus
 * a margin, so the row wraps to a second line before it ever reaches that
 * corner, regardless of how a narrower pane's width ends up divided around it.
 */
.ops {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  max-width: calc(100% - 24px - 184px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.ops__badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-3);
}

.ops__count {
  font-weight: 650;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.ops__legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ops__swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.ops__swatch--base {
  background: var(--accent);
  /* The subtrahend colour, so the badge carries both halves of the pairing the
     scene is painted in rather than only naming one of them. */
  box-shadow: 10px 0 0 var(--accent-secondary);
  margin-right: 10px;
}

.ops__row {
  display: flex;
  gap: 4px;
  /* Unconditional, not gated behind the phone media query below: the new
     `max-width` on `.ops` above is what decides *whether* wrapping is needed
     (container-relative, so it also catches the tablet-pane squeeze), and this
     is what actually performs it once that width is exceeded. */
  flex-wrap: wrap;
}

.ops__btn {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.ops__glyph {
  font-size: 14px;
  line-height: 1;
}

.ops__btn:hover:not(:disabled),
.ops__btn:focus-visible:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.ops__btn:active:not(:disabled) {
  background: var(--accent);
  color: var(--accent-contrast);
}

.ops__btn:disabled {
  /* Dimmed rather than hidden: the control has to be visible while it is
     unavailable, or the user never learns the operation exists. */
  opacity: 0.45;
  cursor: not-allowed;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .ops {
    top: 8px;
    left: 8px;
    padding: 4px;
    /* No `max-width` override here on purpose (there used to be one,
       `calc(100vw - 16px)` — removed): at phone width the viewport pane spans
       essentially the whole page (Library/Inspector are bottom sheets there,
       not side panels), so `calc(100vw - 16px)` (≈374px on a 390px phone) is
       *looser* than the base rule's container-relative cap above (≈182px) —
       and because this block is declared later, it was winning and silently
       undoing the base rule's protection at exactly the width where the
       orientation gizmo's corner is tightest. Confirmed by measurement, not
       assumed: Firefox renders this row's button labels ~15px wider than
       Chromium, which was just enough at the old 374px cap to reach past the
       gizmo's Front-view cap's own click point — a real, engine-specific
       regression this fourth button caused, caught by `TODO/ui-015`'s own full
       e2e run. Inheriting the tighter base cap fixes it in every engine at
       once rather than re-deriving a second, phone-specific budget.
    */
  }

  .ops__btn {
    /* Still a comfortable tap target at 390px: three buttons of ~70px plus gaps
       fit inside the phone's width with room to spare. */
    min-height: var(--tap-compact);
    padding: 0 8px;
    font-size: 11px;
  }

  .ops__label {
    font-size: 11px;
  }
}
</style>
