<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A link that leaves the app (`TODO/build-029`). On the web it is a plain
 * `<a target="_blank" rel="noopener noreferrer">`. Inside the native shell the web view has no new
 * windows and must never navigate away, so a click is intercepted and the page opens in the system
 * browser instead. The shell check lives here and in `src/native/shell.js`, not at each call site.
 */
import { isNativeShell, openExternal, probeShell } from '../../native/shell.js'

const props = defineProps({
  /** The absolute `https:` page to open. */
  href: { type: String, default: undefined },
})

const native = isNativeShell(probeShell())

/** @param {MouseEvent} event */
function onClick(event) {
  if (!native) return
  event.preventDefault()
  if (props.href) openExternal(props.href).catch(() => {})
}
</script>

<template>
  <a :href="href" target="_blank" rel="noopener noreferrer" @click="onClick"><slot /></a>
</template>
