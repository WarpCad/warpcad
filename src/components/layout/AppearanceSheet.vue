<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Appearance** sheet (`TODO/ui-151`), mounted once in `AppView.vue`.
 *
 * - **Trigger**: **File ▾ → Appearance…** (`file-appearance`). Nothing has to be selected or loaded.
 * - **Feedback**: the current mode or style shows pressed. Tapping another repaints the whole app,
 *   the 3D view included, at once and moves the pressed state; the sheet stays open so styles can be
 *   compared. **×**, Escape and a tap on the backdrop close it and focus returns to where it was.
 * - **Small screens**: a full-width bottom sheet at phone width (two tile columns), a card from 641px.
 *
 * It needs no network: the picker is the same `ThemePicker` Help carries, and the theme belongs to
 * the device, not the project (`TODO/ui-113`). It reads and writes only `stores/appearance.js`.
 */
import { useAppearanceStore } from '../../stores/appearance.js'
import IconButton from '../controls/IconButton.vue'
import ThemePicker from '../controls/ThemePicker.vue'
import BaseSheet from './BaseSheet.vue'

const appearance = useAppearanceStore()
</script>

<template>
  <BaseSheet
    :open="appearance.isOpen"
    testid="appearance-sheet"
    title="Appearance"
    modal
    card
    width="420px"
    @backdrop="appearance.close()"
    @escape="appearance.close()"
  >
    <div class="appearance__head">
      <h2 class="appearance__title">Appearance</h2>
      <IconButton label="Close appearance" variant="quiet" class="appearance__close" data-testid="appearance-close" data-autofocus @click="appearance.close()">
        ×
      </IconButton>
    </div>
    <ThemePicker testid-prefix="appearance" :phone-columns="2" />
  </BaseSheet>
</template>

<style scoped>
.appearance__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.appearance__title {
  margin: 0;
  font-size: var(--font-size-5);
  font-weight: var(--weight-medium);
}

.appearance__close {
  font-size: var(--text-size-display);
  line-height: 1;
}
</style>
