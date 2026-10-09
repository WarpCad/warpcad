// SPDX-License-Identifier: AGPL-3.0-or-later
import { onBeforeUnmount, watch } from 'vue'

/**
 * Close a dialog on Escape while it is open (`TODO/ai-004`). The listener exists only while
 * `isOpen()` is true, and swallows the key only then, so an Escape with nothing open still
 * reaches whatever else listens for it (the History strip's "leave preview").
 *
 * @param {() => boolean} isOpen
 * @param {() => void} close
 * @returns {void}
 */
export function useEscapeToClose(isOpen, close) {
  /** @param {KeyboardEvent} event */
  const onKey = (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
  }
  const stop = watch(
    isOpen,
    (open) => {
      if (open) document.addEventListener('keydown', onKey)
      else document.removeEventListener('keydown', onKey)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('keydown', onKey)
  })
}
