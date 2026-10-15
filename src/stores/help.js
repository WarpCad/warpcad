// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The in-app help sheet's state (`TODO/ui-061`) — **UI state only**: which page and heading
 * are showing, the Back trail and whether the phone Contents list is unfolded. What it loads is
 * `src/help/loader.js`; which page a tool maps to is `src/help/topics.js`.
 *
 * Opening and closing help changes **nothing else**: not the selection, not the active tool, not
 * a pop-up's fields. That is the contract the **?** buttons depend on, and it holds by
 * construction — this store imports none of those stores.
 *
 * @module stores/help
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { DEFAULT_TOPIC, resolveTopic } from '../help/topics.js'

export const useHelpStore = defineStore('help', () => {
  const isOpen = ref(false)
  /** The topic id that opened the sheet; `''` once the reader has followed a link elsewhere. */
  const topic = ref('')
  const page = ref('')
  /** @type {import('vue').Ref<string | undefined>} */
  const anchor = ref(undefined)
  /** Phone width folds the Contents list behind a button; this is that button's state. */
  const contentsOpen = ref(false)
  /** Bumped on every navigation so the target heading flashes again for a repeat open. */
  const nonce = ref(0)
  /** @type {import('vue').Ref<{ page: string, anchor: string | undefined, topic: string }[]>} */
  const trail = ref([])

  const canGoBack = computed(() => trail.value.length > 0)

  /**
   * @param {string} nextPage
   * @param {string | undefined} nextAnchor
   * @param {string} nextTopic
   */
  function go(nextPage, nextAnchor, nextTopic) {
    const same = isOpen.value && page.value === nextPage && anchor.value === nextAnchor
    if (isOpen.value && !same && page.value !== '') {
      trail.value.push({ page: page.value, anchor: anchor.value, topic: topic.value })
    }
    page.value = nextPage
    anchor.value = nextAnchor
    topic.value = nextTopic
    isOpen.value = true
    contentsOpen.value = false
    nonce.value += 1
  }

  /**
   * Open the docs for a tool. An unknown id opens Getting started rather than nothing.
   *
   * @param {string} id a key of `TOPICS`
   */
  function open(id) {
    const resolved = resolveTopic(id)
    go(resolved.page, resolved.anchor, id)
  }

  /**
   * Follow a link to a docs page (an in-sheet link, a Contents row, a `#/help/<page>` hash).
   *
   * @param {string} nextPage page slug
   * @param {string} [nextAnchor] heading id
   */
  function openPage(nextPage, nextAnchor) {
    go(nextPage, nextAnchor, '')
  }

  /** Return along the trail of pages followed from the sheet. */
  function back() {
    const previous = trail.value.pop()
    if (!previous) return
    page.value = previous.page
    anchor.value = previous.anchor
    topic.value = previous.topic
    contentsOpen.value = false
    nonce.value += 1
  }

  function close() {
    isOpen.value = false
    contentsOpen.value = false
    trail.value = []
  }

  /** The `?` / F1 key and the Help entry: open at Getting started, or close if already open. */
  function toggle() {
    if (isOpen.value) close()
    else open(DEFAULT_TOPIC)
  }

  function toggleContents() {
    contentsOpen.value = !contentsOpen.value
  }

  return { isOpen, topic, page, anchor, contentsOpen, nonce, canGoBack, open, openPage, back, close, toggle, toggleContents }
})
