/**
 * User-facing app settings — UI state, but the *persisted* kind: unlike
 * `selection.js` or `transformPreview.js`, a setting here is meant to survive
 * a reload, so this store also owns the read/write boundary against
 * `localStorage` (`TODO/ui-019` — the project's first use of `localStorage`
 * at all, so this file is also the template the next settings addition
 * should copy this boundary pattern from).
 *
 * ## Why a preset id, not free-form bindings
 *
 * `ui-018` hardcoded one desktop convention for viewport pan/orbit
 * (Shift+Left or Right-drag pans, plain Left-drag orbits). `ui-019`
 * deliberately ships a small, *fixed* list of alternate conventions rather
 * than a general per-action rebinding UI — a rebinding UI has its own
 * conflict-resolution questions (what if two actions land on the same
 * trigger?) that are explicitly out of scope here. `Viewport.vue`'s
 * `effectiveDragMode()` takes the current preset id as an input to a small
 * mapping table, so a future third preset only ever touches
 * `MOUSE_NAV_PRESETS` below, never the pointer-handling logic itself.
 *
 * ## The localStorage boundary
 *
 * `localStorage.getItem`/`setItem` can throw in a locked-down browser or some
 * private-browsing modes (CLAUDE.md's "always mock at the boundary" rule,
 * applied here for real rather than only in the unit test). Every read and
 * write below is wrapped in try/catch; a blocked or throwing store falls back
 * to the default preset and the app proceeds exactly as if nothing were
 * stored — it must never crash startup.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { EXPORT_FORMATS } from '../core/export.js'

/** @typedef {'shift-or-right-pans' | 'left-pans'} MouseNavPresetId */

/** Namespaced so a future setting added to this store doesn't collide. */
const STORAGE_KEY = 'warpcad.mouseNav'

/** The Export popover's last format (`TODO/ui-034`), same boundary rules as above. */
const EXPORT_FORMAT_KEY = 'warpcad.exportFormat'

/** STL is the v1 priority (`interaction-model-qa.md` §12): scenario 11's consumer is a slicer. */
export const DEFAULT_EXPORT_FORMAT = /** @type {import('../core/export.js').ExportFormat} */ ('stl')

/** @param {unknown} value @returns {value is import('../core/export.js').ExportFormat} */
function isExportFormat(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, value)
}

/** `ui-018`'s original, hardcoded scheme — the out-of-the-box default. */
export const DEFAULT_MOUSE_NAV_PRESET = /** @type {MouseNavPresetId} */ ('shift-or-right-pans')

/**
 * The fixed list of mouse-navigation presets `ui-019` ships, in the order the
 * settings control lists them. `Viewport.vue`'s `effectiveDragMode()` reads
 * only the `id`; the `label` is display-only.
 *
 * @type {ReadonlyArray<{ id: MouseNavPresetId, label: string }>}
 */
export const MOUSE_NAV_PRESETS = Object.freeze([
  { id: 'shift-or-right-pans', label: 'Shift+Left or Right-drag pans' },
  { id: 'left-pans', label: 'Left-drag pans, Right-drag orbits' },
])

const VALID_PRESET_IDS = new Set(MOUSE_NAV_PRESETS.map((preset) => preset.id))

/**
 * Read the stored preset id, falling back to the default for anything
 * missing, corrupt, unknown, or unreadable (a throwing `localStorage`).
 *
 * @returns {MouseNavPresetId}
 */
function readStoredMouseNavPreset() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored && VALID_PRESET_IDS.has(/** @type {MouseNavPresetId} */ (stored))
      ? /** @type {MouseNavPresetId} */ (stored)
      : DEFAULT_MOUSE_NAV_PRESET
  } catch {
    // Private browsing, a disabled storage setting, or a full quota can all
    // make `getItem` throw outright — fall back quietly rather than crash
    // startup.
    return DEFAULT_MOUSE_NAV_PRESET
  }
}

/**
 * Write the preset id back, swallowing any storage failure the same way.
 *
 * @param {MouseNavPresetId} id
 * @returns {void}
 */
function writeStoredMouseNavPreset(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // The in-memory store still reflects the choice for this session even
    // when it can't be persisted.
  }
}

/**
 * @returns {import('../core/export.js').ExportFormat}
 */
function readStoredExportFormat() {
  try {
    const stored = localStorage.getItem(EXPORT_FORMAT_KEY)
    return isExportFormat(stored) ? stored : DEFAULT_EXPORT_FORMAT
  } catch {
    return DEFAULT_EXPORT_FORMAT
  }
}

/** @param {import('../core/export.js').ExportFormat} format */
function writeStoredExportFormat(format) {
  try {
    localStorage.setItem(EXPORT_FORMAT_KEY, format)
  } catch {
    // Remembered for this session in memory; just not across reloads.
  }
}

export const useSettingsStore = defineStore('settings', () => {
  /** @type {import('vue').Ref<MouseNavPresetId>} */
  const mouseNavPreset = ref(readStoredMouseNavPreset())

  /**
   * Apply and persist a new mouse-navigation preset. Takes effect on the very
   * next drag — nothing here needs a reload, since `Viewport.vue` reads this
   * ref live from `effectiveDragMode()`.
   *
   * @param {string} id One of `MOUSE_NAV_PRESETS`' ids.
   * @returns {void}
   */
  function setMouseNavPreset(id) {
    if (!VALID_PRESET_IDS.has(/** @type {MouseNavPresetId} */ (id))) return
    mouseNavPreset.value = /** @type {MouseNavPresetId} */ (id)
    writeStoredMouseNavPreset(mouseNavPreset.value)
  }

  /** @type {import('vue').Ref<import('../core/export.js').ExportFormat>} */
  const exportFormat = ref(readStoredExportFormat())

  /**
   * Remember the Export popover's format (`TODO/ui-034`). An unknown value is ignored,
   * not stored — a corrupt call must not poison the next session's default.
   *
   * @param {string} format One of `EXPORT_FORMATS`' keys.
   * @returns {void}
   */
  function setExportFormat(format) {
    if (!isExportFormat(format)) return
    exportFormat.value = format
    writeStoredExportFormat(format)
  }

  return {
    mouseNavPreset,
    setMouseNavPreset,
    exportFormat,
    setExportFormat,
  }
})
