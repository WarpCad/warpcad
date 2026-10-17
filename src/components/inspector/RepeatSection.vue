<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A repeat body in the Inspector (`TODO/ui-069`; the behaviour is `TODO/core-061` decision 6).
 *
 * A repeat is derived, not edited on its own: its members are its source's steps re-aimed at
 * each target. So this section says what it repeats and where, and offers the two ways out:
 *
 * - **Go to Bolt 1** (`repeat-goto-source`) — select the source, which is where edits happen;
 *   every repeat follows them.
 * - **Detach** (`repeat-detach`) — replace the repeat with one independent body per member
 *   (one Undo step), for "this one bolt needs to be different". Off while a member is broken or
 *   the source is gone, saying why.
 *
 * Drilled into one member (`hole3`), it says what Delete does there instead: removes just that
 * repeat. Broken members are listed by name, with the reason.
 */
import { computed, ref } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

const props = defineProps({
  /** The Inspector's body description; carries `repeat` (`core/inspector.js`). */
  body: { type: Object, required: true },
})

const documentStore = useDocumentStore()
const selection = useSelectionStore()

/** @type {import('vue').ComputedRef<import('../../core/repeat.js').RepeatInfo>} */
const info = computed(() => props.body.repeat)

/** The member a drilled-into part belongs to (`hole3` for `hole3` or `hole3.tap`), or `null`. */
const member = computed(() => {
  const partName = props.body.subPart?.partName
  if (!partName) return null
  return info.value.targets.find((name) => partName === name || partName.startsWith(`${name}.`)) ?? null
})

const sourceLive = computed(() => documentStore.bodies.some((body) => body.id === info.value.source))

/** `hole2, hole3 and hole4`. */
const targetList = computed(() => {
  const names = info.value.targets
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
})

/** Why Detach is off, or `''`. */
const detachReason = computed(() => {
  if (!sourceLive.value) return `${info.value.sourceName} is gone, so there is nothing to detach from`
  if (info.value.broken.length > 0) {
    return `Repair or remove ${info.value.broken.map((broken) => broken.target).join(', ')} first`
  }
  return ''
})

/** The last refusal Detach met. */
const error = ref('')

function goToSource() {
  if (!sourceLive.value) return
  selection.select(info.value.source)
}

function detach() {
  error.value = ''
  if (detachReason.value !== '') return
  try {
    documentStore.detachRepeat(props.body.id)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  }
}
</script>

<template>
  <section class="repeat-info" data-testid="inspector-repeat" :data-source="info.source">
    <p v-if="member" class="repeat-info__line" data-testid="inspector-repeat-member">
      The repeat on <strong>{{ member }}</strong> — a copy of {{ info.sourceName }}'s steps, aimed at
      {{ member }}. <strong>Remove this repeat</strong> below takes just this one away.
    </p>
    <p v-else class="repeat-info__line" data-testid="inspector-repeat-source">
      Repeats <strong>{{ info.sourceName }}</strong> on {{ info.seedName }}'s {{ targetList }}. Edit
      {{ info.sourceName }} and every repeat follows.
    </p>

    <ul v-if="info.broken.length > 0" class="repeat-info__broken" data-testid="inspector-repeat-broken">
      <li v-for="broken in info.broken" :key="broken.target">
        <strong>{{ broken.target }}</strong> can't be built: {{ broken.reason }}
      </li>
    </ul>
    <p v-if="info.inactive.length > 0" class="repeat-info__line" data-testid="inspector-repeat-inactive">
      Off by their own condition: {{ info.inactive.join(', ') }}.
    </p>

    <div class="repeat-info__actions">
      <button
        type="button"
        class="repeat-info__button"
        data-testid="repeat-goto-source"
        :disabled="!sourceLive"
        :title="sourceLive ? `Select ${info.sourceName}, where its steps are edited` : `${info.sourceName} is gone`"
        @click="goToSource"
      >
        Go to {{ info.sourceName }}
      </button>
      <button
        v-if="!member"
        type="button"
        class="repeat-info__button"
        data-testid="repeat-detach"
        :disabled="detachReason !== ''"
        :title="detachReason || 'Turn each repeat into its own part, no longer linked'"
        @click="detach"
      >
        Detach
      </button>
    </div>
    <p v-if="!member && detachReason" class="repeat-info__line repeat-info__line--quiet" data-testid="repeat-detach-reason">
      {{ detachReason }}
    </p>
    <p v-if="error" class="repeat-info__error" role="alert" data-testid="repeat-detach-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.repeat-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.repeat-info__line {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-1);
}

.repeat-info__line--quiet {
  color: var(--text-3);
}

.repeat-info__broken {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--danger);
}

.repeat-info__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.repeat-info__button {
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.repeat-info__button:disabled {
  color: var(--text-3);
  cursor: not-allowed;
}

.repeat-info__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
