// SPDX-License-Identifier: AGPL-3.0-or-later
import { useOverlayStack } from './useOverlayStack.js'

/**
 * Close a dialog on Escape while it is open (`TODO/ai-004`). A thin wrapper over
 * `useOverlayStack` (`TODO/ui-110`), kept until the base components of `ui-116` replace its
 * callers: Escape closes only the top open overlay, and an Escape with nothing open still reaches
 * whatever else listens for it.
 *
 * @param {() => boolean} isOpen
 * @param {() => void} close
 * @returns {void}
 */
export function useEscapeToClose(isOpen, close) {
  useOverlayStack(isOpen, close)
}
