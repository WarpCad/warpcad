<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The theme picker (`TODO/ui-113`, `TODO/ui-151`): the three **Theme** modes (System follows the
 * device, Dark and Light override it) and the **Style** tiles (`src/styles/skins/`), a whole look fixed
 * to light or dark. Picking a style releases the mode and picking a mode releases the style, because
 * both are one preference (`useTheme`).
 *
 * It calls `useTheme()` itself and takes no theme props: there is one theme singleton, so the Help
 * sheet's copy and the Appearance sheet's copy always agree. Each tile's swatch is drawn by its
 * style's own file (`--swatch-*`), so a tile looks like its style whichever theme paints around it.
 *
 * - **`testidPrefix`** names the test ids: `<prefix>-theme` and `<prefix>-style` for the groups and
 *   `<prefix>-theme-<choice>` for every button (Help keeps `help`, the sheet uses `appearance`).
 * - **`phoneColumns`** is the tile grid's column count up to 640px wide; from 641px it is three.
 */
import { computed, useId } from 'vue'

import { useTheme } from '../../composables/useTheme.js'
import { THEME_MODES, THEME_STYLES } from '../../stores/settings.js'

defineProps({
  testidPrefix: { type: String, default: 'help' },
  phoneColumns: { type: Number, default: 3, validator: (/** @type {number} */ v) => v === 2 || v === 3 },
})

const theme = useTheme()
const uid = useId()

/** The visible words of the three theme segments. @type {Record<string, string>} */
const THEME_LABELS = { system: 'System', dark: 'Dark', light: 'Light' }

/** The visible words of the style tiles (`src/styles/skins/`). @type {Record<string, string>} */
const STYLE_LABELS = { kids: 'Kids', glass: 'Glass', deco: 'Art Deco', minimal: 'Minimal', blueprint: 'Blueprint', pixel: 'Pixel' }

const preference = computed(() => theme.preference.value)
</script>

<template>
  <div class="theme-picker">
    <div class="theme-picker__modes" role="group" :aria-labelledby="`${uid}-theme`" :data-testid="`${testidPrefix}-theme`">
      <span :id="`${uid}-theme`" class="theme-picker__label">Theme</span>
      <button
        v-for="choice in THEME_MODES"
        :key="choice"
        type="button"
        class="theme-picker__mode"
        :aria-pressed="preference === choice ? 'true' : 'false'"
        :data-testid="`${testidPrefix}-theme-${choice}`"
        @click="theme.setPreference(choice)"
      >
        {{ THEME_LABELS[choice] ?? choice }}
      </button>
    </div>
    <div class="theme-picker__styles" role="group" :aria-labelledby="`${uid}-style`" :data-testid="`${testidPrefix}-style`">
      <span :id="`${uid}-style`" class="theme-picker__label">Style</span>
      <div class="theme-picker__grid" :class="{ 'theme-picker__grid--two': phoneColumns === 2 }">
        <button
          v-for="style in THEME_STYLES"
          :key="style"
          type="button"
          class="theme-picker__tile"
          :aria-pressed="preference === style ? 'true' : 'false'"
          :data-testid="`${testidPrefix}-theme-${style}`"
          @click="theme.setPreference(style)"
        >
          <span class="theme-swatch" :class="`theme-swatch--${style}`" aria-hidden="true">
            <span class="theme-swatch__panel">Aa<span class="theme-swatch__accent" /></span>
          </span>
          <span class="theme-picker__name">{{ STYLE_LABELS[style] ?? style }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-picker__modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 var(--space-4h);
  margin-top: 8px;
  color: var(--text-2);
  font-size: var(--text-size-md);
}

.theme-picker__mode {
  flex: 1 1 0;
  min-width: var(--tap);
  min-height: var(--tap);
  max-width: 120px;
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: var(--text-size-md);
  cursor: pointer;
  touch-action: manipulation;
}

.theme-picker__mode:first-of-type {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.theme-picker__mode:last-of-type {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.theme-picker__mode + .theme-picker__mode {
  margin-left: -1px;
}

.theme-picker__mode[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

.theme-picker__mode:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.theme-picker__styles {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: 12px;
  color: var(--text-2);
  font-size: var(--text-size-md);
}

.theme-picker__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  max-width: 420px;
}

@media (max-width: 640px) {
  .theme-picker__grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.theme-picker__tile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  min-height: var(--tap);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: var(--text-size-sm);
  cursor: pointer;
  touch-action: manipulation;
}

.theme-picker__tile[aria-pressed='true'] {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
  color: var(--text-1);
}

.theme-picker__tile:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.theme-picker__name {
  text-align: center;
}

/* A thumbnail of the style: its ground, one of its panels, a word in its type and a dot of its accent.
   The `--swatch-*` values are set per style in `src/styles/skins/*.css`, so a tile looks like its style
   whichever theme is painted around it. */
.theme-swatch {
  display: grid;
  place-items: center;
  height: 46px;
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: var(--swatch-ground);
}

.theme-swatch__panel {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: var(--swatch-edge);
  border-radius: var(--swatch-radius);
  background: var(--swatch-panel);
  color: var(--swatch-ink);
  font-family: var(--swatch-font);
  font-size: var(--text-size-lg);
  line-height: 1.2;
  box-shadow: var(--swatch-shadow);
}

.theme-swatch__accent {
  width: 12px;
  height: 12px;
  border-radius: var(--swatch-radius);
  background: var(--swatch-accent);
}
</style>
