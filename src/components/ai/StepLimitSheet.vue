<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The project's **AI step limit** (`TODO/ai-033`): how many steps one AI turn may build, set here
 * and nowhere else — no agent can change it.
 *
 * Opened from the Assistant panel's bar (**Limit: 1,000 steps**, `ai-step-limit-open`) or from the
 * stop notice (**Change limit…**, `ai-step-limit-from-notice`). A bottom sheet over the viewport at
 * phone width (`ModalShell`'s `sheet`, lifted above the on-screen keyboard), the ordinary dialog
 * from 641px — like `KeySheet`, but this value is the **project's**, saved in its file, where
 * `KeySheet` holds the browser's.
 *
 * - **Save** sets the project's value and approves it in this browser. A value out of range or
 *   not whole keeps the sheet open with the range under the field, and saves nothing.
 * - When the loaded project asks for more than this browser approved, the note says so and
 *   **Use N** approves it (`src/ai/stepLimitApproval.js`). Until then the lower value applies.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { formatSteps } from '../../core/aiBudget.js'
import { useAiLimitStore } from '../../stores/aiLimit.js'
import ModalShell from '../storage/ModalShell.vue'

const limit = useAiLimitStore()

/** The field's text; filled with the project's value each time the sheet opens. */
const text = ref('')
/** @type {import('vue').Ref<HTMLInputElement | null>} */
const input = ref(null)

watch(
  () => limit.isOpen,
  async (open) => {
    if (!open) return
    text.value = String(limit.stored)
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
)

const asked = computed(() => formatSteps(limit.stored))
const inForce = computed(() => formatSteps(limit.effective))

function save() {
  limit.save(text.value)
}
</script>

<template>
  <ModalShell :open="limit.isOpen" sheet testid="ai-step-limit-sheet" title="AI step limit" help-topic="assistant-step-limit" @backdrop="limit.close()">
    <p class="limit__help">
      How many steps one AI turn may build in this project. The limit is saved with the project, and only you can change it.
    </p>
    <p v-if="limit.untrusted" class="limit__warn" role="status" data-testid="ai-step-limit-untrusted">
      This project asks for {{ asked }} steps. It's using {{ inForce }} until you approve it.
      <button type="button" class="limit__button limit__button--inline" data-testid="ai-step-limit-approve" @click="limit.approve()">
        Use {{ asked }}
      </button>
    </p>
    <form class="limit__form" novalidate @submit.prevent="save()">
      <label class="limit__field">
        Steps per turn
        <input
          ref="input"
          v-model="text"
          class="limit__input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :aria-invalid="limit.error !== '' ? 'true' : 'false'"
          aria-describedby="ai-step-limit-error"
          data-testid="ai-step-limit-input"
        />
      </label>
      <p v-if="limit.error" id="ai-step-limit-error" class="limit__error" role="alert" data-testid="ai-step-limit-error">{{ limit.error }}</p>
      <p class="limit__note">A higher limit lets one turn spend more of your API budget.</p>
      <div class="limit__actions">
        <button type="button" class="limit__button" data-testid="ai-step-limit-cancel" @click="limit.close()">Cancel</button>
        <button type="submit" class="limit__button limit__button--primary" data-testid="ai-step-limit-save">Save</button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.limit__help,
.limit__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.limit__warn {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--warn);
}

.limit__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.limit__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-1);
}

.limit__input {
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  /* 16px so iOS Safari does not zoom the page when the field takes focus. */
  font-size: 16px;
}

.limit__input[aria-invalid='true'] {
  border-color: var(--danger);
}

.limit__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.limit__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.limit__button {
  min-width: 80px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.limit__button--inline {
  min-width: 0;
}

.limit__button--primary {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
