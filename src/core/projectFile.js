// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project file's name on disk, in one place (`TODO/io-035`).
 *
 * **Save** writes `name.warpcad`. The bytes inside are unchanged NDJSON (`core/ndjson.js`,
 * `core/project.js`); only the extension is WarpCad's own, so the native app can claim it as a file
 * type without claiming every `.ndjson` on the device (`warpcad-native`'s `io-030`, `io-036`).
 * **Open** keeps reading `.ndjson`, so every project saved before the change still opens; nothing
 * renames a user's file, and a project opened from `bracket.ndjson` and saved in place stays
 * `bracket.ndjson` until **Save As**.
 *
 * Every path that names a project file (Save, Save As, the native Documents list, a published
 * gist, **Send the file**, a hosted repository's default path) reads the extension from here, so
 * Save and Open cannot drift apart. The native app's own internal copies (`autosave.ndjson`,
 * `library/<id>.ndjson` in `storage/nativeMirror.js`) are app data the user never sees in Files,
 * and stay `.ndjson` on purpose (`docs/decisions/document-sync.md`).
 *
 * Framework-free.
 *
 * @module core/projectFile
 */

/** What Save names a project file. */
export const PROJECT_EXTENSION = '.warpcad'

/** Extensions Open still reads as a project, oldest last. */
export const LEGACY_PROJECT_EXTENSIONS = Object.freeze(['.ndjson'])

/** Every extension that names a project file, the saved one first. */
export const PROJECT_EXTENSIONS = Object.freeze([PROJECT_EXTENSION, ...LEGACY_PROJECT_EXTENSIONS])

/**
 * The MIME type a project file is downloaded and offered under. NDJSON, because the bytes are;
 * the native app's exported `com.warpcad.project` type carries no MIME tag of its own (`io-036`).
 */
export const PROJECT_MIME = 'application/x-ndjson'

/**
 * The project extension `name` ends with, in its canonical lowercase spelling, or `null`. A bare
 * extension (`.warpcad`) has no name in front of it and is not a project file name.
 *
 * @param {string} name a file name, `bracket.warpcad`
 * @returns {string | null} `.warpcad`, `.ndjson` or `null`
 */
export function projectExtensionOf(name) {
  if (typeof name !== 'string') return null
  const lower = name.toLowerCase()
  return PROJECT_EXTENSIONS.find((extension) => lower.length > extension.length && lower.endsWith(extension)) ?? null
}

/**
 * Whether `name` names a WarpCad project: `bracket.warpcad`, or a legacy `bracket.ndjson`, in any
 * letter case.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isProjectFileName(name) {
  return projectExtensionOf(name) !== null
}

/**
 * `name` without its project extension (`bracket.ndjson` → `bracket`); any other name unchanged.
 *
 * @param {string} name
 * @returns {string}
 */
export function stripProjectExtension(name) {
  const extension = projectExtensionOf(name)
  return extension === null ? name : name.slice(0, -extension.length)
}
