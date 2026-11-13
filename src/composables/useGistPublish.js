// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Share sheet's gist group as a composable (`TODO/io-017`). The orchestration lives in
 * `stores/gistPublish.js`, because `stores/fileMenu.js` calls it too and no store imports a
 * composable (`TODO/ui-109`); components keep importing it from here.
 *
 * @module composables/useGistPublish
 */

import { createGistPublisher } from '../stores/gistPublish.js'

export { GIST_MERGE_SOURCE, GIST_ORIGIN } from '../stores/gistPublish.js'

/** @typedef {import('../stores/gistPublish.js').GistPublishOk} GistPublishOk */

/**
 * The Share sheet's gist group, as state and three actions.
 *
 * @param {{ now?: () => number }} [options] `now` — the clock the README's "Last published" reads.
 * @returns {ReturnType<typeof createGistPublisher>}
 */
export function useGistPublish(options = {}) {
  return createGistPublisher(options)
}
