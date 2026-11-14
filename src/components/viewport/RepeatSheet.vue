<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Repeat panel (`TODO/ui-069`): what a Repeat session is about to do, while the user makes
 * the first part the ordinary way. All state and every rule live in `stores/repeat.js`; this
 * file lays out pixels.
 *
 * - **Top line** — *Repeat on Raspberry Pi 1 › hole1 and 3 more*.
 * - **Targets** — the seed body's parts as checkboxes, its name family first; the seed is
 *   ticked and locked (`repeat-target-<part>`).
 * - **Status** — what to do next, then *Recording Bolt 1: 3 steps* with each step listed (↻ on
 *   the ones re-aimed per target), and anything else committed since under **Not part of the
 *   repeat**, each with a one-line reason. A step on the first part that the Assistant, Claude Code
 *   or a merge made is listed there too and left out of every copy (`TODO/core-063`); Apply stays
 *   on.
 * - **Apply to N more** (`repeat-apply`) and **Cancel** (`repeat-cancel`; Escape is the
 *   Operations toolbar's, after its own popover — `ui-060`'s order).
 *
 * It stays open while the user works — no backdrop, so the Library, the viewport, the Align
 * popover and the Inspector all keep working. At tablet and laptop width it floats where the
 * Align popover does, one layer below it; at phone width it is a bottom sheet that shrinks to
 * one bar (`Repeating on 4 · Bolt 1: 3 steps · Apply`) whenever the user presses in the 3D view
 * or opens the Library, and the bar's Apply works without expanding it.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'

import BaseButton from '../controls/BaseButton.vue'
import HelpButton from '../controls/HelpButton.vue'
import IconButton from '../controls/IconButton.vue'
import { useRepeatStore } from '../../stores/repeat.js'
import BaseSheet from '../layout/BaseSheet.vue'

const repeat = useRepeatStore()

/** The bar's one line at phone width. */
const barText = computed(() => {
  const subject = repeat.subject
  if (!subject) return `Repeating on ${repeat.ticked.length}`
  const count = repeat.steps.length
  const noun = count === 1 ? 'step' : 'steps'
  return `Repeating on ${repeat.ticked.length} · ${subject.name}: ${count} ${noun}`
})

/** The live reason Apply is off, worth showing once there is a subject to talk about. */
const shownReason = computed(() => (repeat.subject && !repeat.canApply ? repeat.applyReason : null))

/**
 * A press in the 3D view shrinks the phone sheet out of the way (the CSS only shows the bar
 * at phone width, so this is harmless wider). Capture phase, read-only: it never stops the
 * press reaching the canvas.
 *
 * @param {PointerEvent} event
 */
function onWindowPointerDown(event) {
  if (!repeat.armed) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('[data-testid="viewport-canvas"]')) repeat.minimize()
}

onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onWindowPointerDown, true))
</script>

<template>
  <BaseSheet
    :open="repeat.armed && !!repeat.seed"
    tier="dock"
    :stack="false"
    class="repeat"
    :class="{ 'repeat--minimized': repeat.minimized }"
    testid="repeat-sheet"
    title="Repeat"
    :data-minimized="repeat.minimized ? 'true' : 'false'"
    :data-subject="repeat.subject?.id ?? ''"
  >
      <!-- Phone width only (CSS): the one-line bar the sheet shrinks to. -->
      <div class="repeat__bar" data-testid="repeat-bar">
        <BaseButton variant="quiet" class="repeat__bar-text" data-testid="repeat-expand" @click="repeat.expand()">
          {{ barText }}
        </BaseButton>
        <BaseButton
          variant="primary"
          data-testid="repeat-bar-apply"
          :disabled="!repeat.canApply"
          :title="repeat.canApply ? repeat.applyLabel : (repeat.applyReason ?? '')"
          @click="repeat.apply()"
        >
          Apply
        </BaseButton>
      </div>

      <div class="repeat__body">
        <div class="repeat__head">
          <p class="repeat__title" data-testid="repeat-headline">{{ repeat.headline }}</p>
          <IconButton bordered class="repeat__minimize" label="Shrink the Repeat panel" data-testid="repeat-minimize" @click="repeat.minimize()">
            ▾
          </IconButton>
          <HelpButton topic="repeat" class="repeat__help" />
        </div>

        <fieldset class="repeat__targets" data-testid="repeat-targets">
          <legend class="repeat__legend">Targets</legend>
          <label v-for="name in repeat.orderedParts" :key="name" class="repeat__target">
            <input
              type="checkbox"
              :data-testid="`repeat-target-${name}`"
              :checked="repeat.ticked.includes(name)"
              :disabled="name === repeat.seed?.partName"
              @change="repeat.toggleTarget(name)"
            />
            <span>{{ name }}</span>
            <span v-if="name === repeat.seed?.partName" class="repeat__seed-tag">first part</span>
          </label>
        </fieldset>

        <p class="repeat__status" data-testid="repeat-status">{{ repeat.status }}</p>
        <ol v-if="repeat.steps.length > 0" class="repeat__steps" data-testid="repeat-steps">
          <li
            v-for="step in repeat.steps"
            :key="step.id"
            class="repeat__step"
            data-testid="repeat-step"
            :data-mentions-seed="step.mentionsSeed ? 'true' : 'false'"
          >
            <span v-if="step.mentionsSeed" class="repeat__reaim" :title="`Re-aimed at each target instead of ${repeat.seed?.partName}`">↻</span>
            {{ step.label }}
          </li>
        </ol>
        <div v-if="repeat.outside.length > 0" class="repeat__outside" data-testid="repeat-outside">
          <p class="repeat__outside-title">Not part of the repeat</p>
          <ul class="repeat__steps">
            <li v-for="step in repeat.outside" :key="step.id" class="repeat__step" data-testid="repeat-outside-step" :data-origin="step.origin">
              {{ step.label }}
              <span class="repeat__why" data-testid="repeat-outside-reason">{{ step.reason }}</span>
            </li>
          </ul>
        </div>

        <p v-if="shownReason" class="repeat__reason" data-testid="repeat-reason">{{ shownReason }}</p>
        <p v-if="repeat.error" class="repeat__reason" role="alert" data-testid="repeat-error">{{ repeat.error }}</p>

        <div class="repeat__actions">
          <BaseButton data-testid="repeat-cancel" @click="repeat.cancel()">Cancel</BaseButton>
          <BaseButton
            variant="primary"
            data-testid="repeat-apply"
            :disabled="!repeat.canApply"
            :title="repeat.canApply ? repeat.applyLabel : (repeat.applyReason ?? '')"
            @click="repeat.apply()"
          >
            {{ repeat.applyLabel }}
          </BaseButton>
        </div>
      </div>
  </BaseSheet>
</template>

<style scoped>
/*
 * Tablet and laptop: floating over the viewport's lower middle, **not** where the Align popover
 * floats. The popover hangs from the top (64px) and the panel stays open while the user aligns
 * and snaps, so a panel at the same spot sat on top of the Operations toolbar and covered the
 * very ⇔ Align button the user needs next (found driving the flow by hand). Down here it clears
 * the toolbar, the popover and the orientation gizmo, one layer **below** the popover (30 vs 31).
 */
body :global(.sheet.repeat) {
  right: auto;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: min(300px, calc(100vw - 32px));
  max-height: calc(100dvh - 200px);
  padding: 10px 12px 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  gap: 0;
}

.repeat__bar,
.repeat .repeat__minimize {
  display: none;
}

.repeat__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.repeat__head {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.repeat__title {
  flex: 1 1 auto;
  margin: 0;
  font-size: var(--text-size-lg);
  font-weight: var(--weight-medium);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

/* The 44px target overhangs the title line rather than growing the header (`TODO/ui-061`). */
.repeat__help {
  margin: -12px -8px -12px 0;
}

.repeat__targets {
  margin: 0;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  max-height: 160px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 8px;
}

.repeat__legend {
  padding: 0 4px;
  font-size: var(--text-size-xs);
  color: var(--text-2);
}

.repeat__target {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-compact);
  font-size: var(--text-size-md);
  overflow-wrap: anywhere;
}

.repeat__target input {
  width: 18px;
  height: 18px;
  flex: none;
}

.repeat__seed-tag {
  font-size: var(--text-size-2xs);
  color: var(--text-3);
}

.repeat__status,
.repeat__outside-title {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-2);
}

.repeat__outside-title {
  font-weight: var(--weight-medium);
}

.repeat__steps {
  margin: 0;
  padding-left: 18px;
  font-size: var(--text-size-sm);
  line-height: 1.45;
}

.repeat__outside .repeat__steps {
  color: var(--text-3);
}

.repeat__why {
  display: block;
  font-size: var(--text-size-xs);
  color: var(--text-3);
}

.repeat__reaim {
  color: var(--accent);
  font-weight: var(--weight-bold);
}

.repeat__reason {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--danger);
}

.repeat__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  /* Stays in view while a long step list scrolls: Apply is never below the fold. */
  position: sticky;
  bottom: -12px;
  margin: 0 -12px -12px;
  padding: 8px 12px 12px;
  background: var(--surface-glass);
}

/*
 * Tablet: the viewport pane is only ~390px wide between the persistent Library and Inspector, so
 * the panel cannot sit beside the navigation chrome (bottom-left) and the scale readout; it
 * lifts above them instead.
 */
@media (min-width: 641px) and (max-width: 1099px) {
  body :global(.sheet.repeat) {
    bottom: 232px;
    max-height: calc(100dvh - 420px);
  }
}

/*
 * Phone width: a bottom sheet over the viewport that shrinks to one bar whenever the user
 * presses in the 3D view or opens the Library, so the view and the Align popover stay usable.
 * Under the Library sheet (20), over the Inspector sheet (11).
 */
@media (max-width: 640px) {
  /* The frame's layer is the `dock` tier: `--z-dock` is 19 at this width, under the Library sheet (20). */
  body :global(.sheet.repeat) {
    /* Above the Library's tab (AppView's `--layout-library-tab-height`, 52px), never over it: the user
       has to open the Library from here to drag the first part in (found driving the phone flow). */
    bottom: 52px;
    left: 0;
    transform: none;
    width: 100%;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: 12px;
    max-height: 40dvh;
  }

  .repeat .repeat__minimize {
    display: inline-flex;
  }

  /* Exactly AppView's `--layout-repeat-bar-height`: the Inspector sheet lifts by this much while the
     bar is up, so the bar never sits on the sheet's sticky Delete row. */
  body :global(.sheet.repeat.repeat--minimized) {
    height: 54px;
    padding: 4px 8px;
    overflow: hidden;
  }

  .repeat--minimized .repeat__body {
    display: none;
  }

  .repeat--minimized .repeat__bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .repeat__bar-text {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
