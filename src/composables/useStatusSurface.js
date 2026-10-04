// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The header chip's text and tone — **one status surface** for autosave, the last explicit
 * save/open, and hosted state (`docs/decisions/interaction-model-qa.md`, "The one status
 * surface"; `TODO/ui-033`).
 *
 * Two stores each know part of the story: `persistence` (autosave, Save/Open results) and
 * `hosted` (Connect, push, pull, conflict). This is the only place that decides which one the
 * user reads, so the chip and the File menu's first line can never disagree.
 *
 * ## Precedence, most urgent first
 *
 * 0. a **load in progress** (`Opening <name>…`, `Restoring your last session…`,
 *    `TODO/core-032`) — what is happening right now, painted before the fold blocks;
 * 1. a **local persistent error** (`Not saved — browser storage unavailable`, a refused file);
 * 2. a **hosted persistent error** (token rejected, no network, a bad remote file);
 * 3. a hosted state that needs the user or is happening now — `paused`/diverged, `pushing`,
 *    `pending` — because a transient "Saved · 14:02" must not reassure while the repository
 *    quietly falls behind;
 * 4. a **notice** — local (`Opened…`, `Download started…`, `Restored your last session`) or
 *    hosted (`Saved to owner/repo · 14:05`, `Pushed · 14:05`): **whichever appeared last wins**.
 *    A fixed order here was wrong in the obvious case — `Restored your last session` lingers
 *    six seconds, and would sit on top of the result of a Connect or Save to the user has just
 *    performed; the newest message is the one about what they just did;
 * 5. autosave's own resting text (`Autosave on`, `Saving…`, `Saved · 14:02`).
 *
 * **The hosted store's resting `Connected to owner/repo` is never used here.** It is non-empty
 * for the whole session, so honouring it would bury autosave's `Saved · 14:02` permanently; the
 * connection is shown by the File button's dot instead.
 *
 * @module composables/useStatusSurface
 */

import { computed, ref, watch } from 'vue'

import { useHostedStore } from '../stores/hosted.js'
import { usePersistenceStore } from '../stores/persistence.js'

/** @typedef {'idle' | 'saving' | 'saved' | 'warn' | 'error'} StatusTone */

/**
 * @returns {{
 *   text: import('vue').ComputedRef<string>,
 *   tone: import('vue').ComputedRef<StatusTone>,
 * }}
 */
export function useStatusSurface() {
  const persistence = usePersistenceStore()
  const hosted = useHostedStore()

  // Which notice is newer. A counter, not a clock: two notices in one millisecond still order.
  let sequence = 0
  const localNoticeAt = ref(0)
  const hostedNoticeAt = ref(0)
  watch(
    () => persistence.notice,
    (text) => {
      if (text) localNoticeAt.value = ++sequence
    },
    { flush: 'sync', immediate: true },
  )
  watch(
    () => hosted.notice,
    (text) => {
      if (text) hostedNoticeAt.value = ++sequence
    },
    { flush: 'sync', immediate: true },
  )

  /**
   * @returns {{ text: string, tone: StatusTone }}
   */
  function resolve() {
    if (persistence.loading) return { text: persistence.loading, tone: 'saving' }
    if (persistence.errorMessage) return { text: persistence.errorMessage, tone: 'error' }
    // What the last load left out (`TODO/sketch-003`): outlives the autosave that follows it.
    if (persistence.loadWarning) return { text: persistence.loadWarning, tone: 'error' }
    if (hosted.connected) {
      if (hosted.errorMessage) return { text: hosted.errorMessage, tone: 'error' }
      const dot = hosted.dotState
      if (dot === 'failed') return { text: hosted.statusText, tone: 'error' }
      if (dot === 'paused') return { text: hosted.statusText, tone: 'warn' }
      if (dot === 'pushing' || dot === 'pending') return { text: hosted.statusText, tone: 'saving' }
    }
    const hostedNotice = hosted.connected && hosted.notice !== ''
    if (persistence.notice && !(hostedNotice && hostedNoticeAt.value > localNoticeAt.value)) {
      return { text: persistence.chipText, tone: persistence.chipTone }
    }
    if (hostedNotice) return { text: hosted.notice, tone: 'saved' }
    return { text: persistence.chipText, tone: persistence.chipTone }
  }

  const resolved = computed(resolve)
  return {
    text: computed(() => resolved.value.text),
    tone: computed(() => resolved.value.tone),
  }
}
