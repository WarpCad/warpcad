// SPDX-License-Identifier: AGPL-3.0-or-later
// One screen built from the base components, so a theme can be judged whole and not one button at a
// time. Pick a theme from the toolbar's Theme menu (the styles are in src/styles/skins/). Storybook-only.
import { ref } from 'vue'

import BaseButton from '../src/components/controls/BaseButton.vue'
import FieldLabel from '../src/components/controls/FieldLabel.vue'
import IconButton from '../src/components/controls/IconButton.vue'
import NumberField from '../src/components/controls/NumberField.vue'
import SegmentedToggle from '../src/components/controls/SegmentedToggle.vue'
import SelectInput from '../src/components/controls/SelectInput.vue'
import TextInput from '../src/components/controls/TextInput.vue'
import BaseBanner from '../src/components/display/BaseBanner.vue'
import BaseChip from '../src/components/display/BaseChip.vue'
import BaseToast from '../src/components/display/BaseToast.vue'
import ListRow from '../src/components/display/ListRow.vue'
import SectionHeading from '../src/components/display/SectionHeading.vue'
import BaseDialog from '../src/components/layout/BaseDialog.vue'

const components = { BaseButton, FieldLabel, IconButton, NumberField, SegmentedToggle, SelectInput, TextInput, BaseBanner, BaseChip, BaseToast, ListRow, SectionHeading, BaseDialog }

const plus = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
const cube = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>'

const panel = `
  <div class="showcase">
    <header class="showcase__bar sb-surface">
      <span class="showcase__brand">WarpCad</span>
      <BaseChip tone="secondary" dot dot-tone="secondary">Saved · 14:05</BaseChip>
      <BaseChip tone="accent" size="lg" dot dot-tone="accent" pulse>Assistant working</BaseChip>
      <span class="showcase__spacer"></span>
      <IconButton label="Add" bordered>${plus}</IconButton>
      <IconButton label="Add part" variant="primary">${plus}</IconButton>
      <BaseButton variant="primary">Share</BaseButton>
    </header>

    <BaseBanner tone="warn">
      Merged 4 steps from bracket-copy.warpcad, 2 steps conflicted
      <template #actions><BaseButton narrow size="compact">Undo merge</BaseButton></template>
    </BaseBanner>

    <div class="showcase__cols">
      <section class="showcase__card sb-surface">
        <SectionHeading :level="2">Inspector</SectionHeading>
        <FieldLabel>Name<TextInput v-model="name" /></FieldLabel>
        <div class="showcase__row">
          <FieldLabel small>Width<NumberField v-model="width" unit="mm" /></FieldLabel>
          <FieldLabel small>Depth<NumberField v-model="depth" unit="mm" /></FieldLabel>
          <FieldLabel small>Height<NumberField v-model="height" unit="mm" /></FieldLabel>
        </div>
        <FieldLabel>Material
          <SelectInput v-model="material"><option value="pla">PLA</option><option value="petg">PETG</option><option value="abs">ABS</option></SelectInput>
        </FieldLabel>
        <SegmentedToggle v-model="axis" label="Axis" :options="axes" />
        <div class="showcase__row">
          <BaseButton>Cancel</BaseButton>
          <BaseButton variant="primary">Extrude</BaseButton>
          <BaseButton variant="danger">Delete</BaseButton>
          <BaseButton variant="link">Help</BaseButton>
        </div>
      </section>

      <section class="showcase__card sb-surface">
        <SectionHeading :level="2">Objects</SectionHeading>
        <div>
          <ListRow v-for="row in rows" :key="row" :selected="row === picked" interactive truncate @click="picked = row">
            <template #leading><span class="showcase__swatch">${cube}</span></template>
            {{ row }}
          </ListRow>
        </div>
        <div class="showcase__row">
          <BaseChip size="sm">suppressed</BaseChip>
          <BaseChip tone="danger" size="sm">broken</BaseChip>
          <BaseChip dashed size="sm">Pi 4</BaseChip>
          <BaseChip tone="neutral" size="lg" dot>MCP agent · connected</BaseChip>
        </div>
        <BaseBanner layout="box" tone="warn">1 item refers to parts this Pi 5 does not have.</BaseBanner>
        <BaseToast>Saved to gist: Bracket<template #action><BaseButton size="compact">Copy link</BaseButton></template></BaseToast>
      </section>
    </div>
  </div>`

const dialog = `
  <BaseDialog open testid="showcase-dialog" title="Extrude sketch" placement="center" width="440px">
    <FieldLabel>Distance<NumberField v-model="height" unit="mm" /></FieldLabel>
    <SegmentedToggle v-model="axis" label="Direction" :options="axes" />
    <div class="showcase__row" style="justify-content: flex-end">
      <BaseButton>Cancel</BaseButton>
      <BaseButton variant="primary">Extrude</BaseButton>
    </div>
  </BaseDialog>`

function setup() {
  return {
    name: ref('Bracket'),
    width: ref(42),
    depth: ref(18.5),
    height: ref(6),
    material: ref('petg'),
    axis: ref('y'),
    axes: [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
      { value: 'z', label: 'Z' },
    ],
    rows: ['Base plate', 'Mounting boss', 'Fillet 2 mm', 'Hole pattern'],
    picked: ref('Mounting boss'),
  }
}

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'Themes/Showcase',
  parameters: { layout: 'fullscreen' },
}

export const Panel = { render: () => ({ components, setup, template: panel }) }
export const WithDialog = { render: () => ({ components, setup, template: panel + dialog }) }
