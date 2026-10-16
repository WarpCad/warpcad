<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Assistant's chat (`TODO/ai-006`), replacing `ai-004`'s minimal connected panel (the
 * connection line, model name, **Key and model…** and **Close** keep their test ids).
 *
 * **Never hides the viewport.** Not a modal: at phone and tablet width it is a translucent
 * bottom sheet that snaps to three heights (peek / half / full) — peek is a one-line status
 * ("Working… step 4") so a long turn stays visible with the chat folded away — and at laptop
 * width a persistent column beside the viewport. `AppView` insets the viewport's overlays by the
 * sheet's height (`data-chat-sheet`).
 *
 * The composer stays above the on-screen keyboard: the sheet is lifted by the gap the
 * **visual viewport** reports (`--kb-inset`), because iOS Safari does not resize the layout
 * viewport for the keyboard and a plain `bottom: 0` sheet ends up behind it.
 *
 * Everything the model said is shown as plain text — assistant text and tool reasons can quote
 * project text, so nothing in this panel is ever rendered as markup.
 *
 * **Watch** (`ai-watch`, `TODO/ai-017`) sits on the status line, beside `ai-status`, so it is in
 * reach at the folded (peek) height too. Enabled only while a turn runs; on, the viewport shows the
 * Assistant's fork read-only in the amber preview (`stores/timeline.js`); off, or the turn ending,
 * returns to the live project. The user is never paused: every other control works during a turn.
 *
 * **Live MCP access** (`TODO/ai-023`): the live bridge's chip sits on the status line too
 * (`BridgeChip`), and the lease control sits beside **Key and model…** (`ConnectButton`). Any
 * local MCP client's changes land in the live project as
 * `mcp` rows; **Undo AI turn** takes back whichever AI change landed last.
 *
 * **Browser agents** (`TODO/ai-021`): where the browser has WebMCP, the header carries the
 * **Browser agents · on / off** switch (`WebMcpChip`). A browser agent's changes land as `webmcp`
 * rows, and **Undo AI turn** takes them back the same way.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { nextStepAfter } from '../../ai/transcript.js'
import { useAgent } from '../../composables/useAgent.js'
import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'
import HelpButton from '../controls/HelpButton.vue'
import ConnectionDot from '../display/ConnectionDot.vue'
import ActivityRow from './ActivityRow.vue'
import BridgeChip from './BridgeChip.vue'
import WebMcpChip from './WebMcpChip.vue'
import ConnectButton from './ConnectButton.vue'
import Composer from './Composer.vue'
import SaveProposal from './SaveProposal.vue'
import TokenReadout from './TokenReadout.vue'

const assistant = useAssistantStore()
const chat = useAiChatStore()
const agent = useAgent()
const documentStore = useDocumentStore()
const selection = useSelectionStore()
const timeline = useTimelineStore()

const open = computed(() => assistant.view === 'chat')
useEscapeToClose(() => open.value, () => assistant.close())

const peek = computed(() => chat.sheet === 'peek')

/** The one line the peek sheet (and the header) shows. */
const statusLine = computed(() => {
  if (chat.running) return `Working… step ${chat.step}`
  const last = chat.items.at(-1)
  if (last?.kind === 'notice') return last.message
  return 'Ready'
})

/** The single selected body, for the "Ask about this" chip. */
const selectedBody = computed(() =>
  selection.ids.length === 1 ? documentStore.bodies.find((body) => body.id === selection.ids[0]) : undefined
)

function askAboutSelection() {
  const body = selectedBody.value
  if (!body) return
  const reference = `About "${body.name}" (${body.id}): `
  chat.draft = chat.draft === '' ? reference : `${reference}${chat.draft}`
}

/**
 * `TODO/ai-008`: the save proposal to pin — the latest one while it still waits for an answer,
 * and once answered, until the next message moves the conversation on. Its tool row stays in the
 * log either way ("Proposed saving … to My parts").
 */
const pinnedSave = computed(() => {
  const items = chat.items
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind !== 'save') continue
    const waiting = item.status === 'proposed' || item.status === 'saving' || item.status === 'failed'
    const movedOn = items.slice(index + 1).some((later) => later.kind === 'user')
    return waiting || !movedOn ? { item, index } : null
  }
  return null
})

/** @param {string} id */
function isLive(id) {
  const current = documentStore.raw.currentIdOf(id) ?? id
  return documentStore.bodies.some((body) => body.id === current)
}

/** @param {import('../../ai/transcript.js').ToolItem} item */
function selectable(item) {
  return item.status === 'ok' && item.bodyIds.some(isLive)
}

// Keep the newest line in view as the transcript grows.
/** @type {import('vue').Ref<HTMLElement | null>} */
const log = ref(null)
watch(
  () => chat.items,
  async () => {
    await nextTick()
    if (log.value) log.value.scrollTop = log.value.scrollHeight
  }
)

// The on-screen keyboard: lift the sheet by the part of the layout viewport the visual viewport
// no longer covers. Zero everywhere the keyboard does not behave this way.
const keyboardInset = ref(0)
function measureKeyboard() {
  const visual = window.visualViewport
  if (!visual) return
  keyboardInset.value = Math.max(0, Math.round(window.innerHeight - visual.height - visual.offsetTop))
}
onMounted(() => {
  window.visualViewport?.addEventListener('resize', measureKeyboard)
  window.visualViewport?.addEventListener('scroll', measureKeyboard)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', measureKeyboard)
  window.visualViewport?.removeEventListener('scroll', measureKeyboard)
})

const HEIGHTS = /** @type {const} */ ([
  { id: 'peek', label: 'Fold' },
  { id: 'half', label: 'Half' },
  { id: 'full', label: 'Tall' },
])
</script>

<template>
  <section
    v-if="open"
    class="chat"
    :class="{ 'chat--deciding': pinnedSave !== null && pinnedSave.item.status !== 'saved' && pinnedSave.item.status !== 'cancelled' }"
    role="complementary"
    aria-label="Assistant"
    data-testid="assistant-panel"
    :data-sheet="chat.sheet"
    :data-running="chat.running ? 'true' : 'false'"
    :style="{ '--kb-inset': `${keyboardInset}px` }"
  >
    <header class="chat__head">
      <ConnectionDot :state="assistant.dotState" testid="assistant-panel-dot" />
      <strong class="chat__title">Assistant</strong>
      <span v-if="assistant.scripted" class="chat__scripted" role="note" title="A recorded transcript is standing in for the model. Nothing here shows what the live model would do." data-testid="ai-scripted-badge">Scripted</span>
      <span class="chat__status" role="status" data-testid="ai-status">{{ statusLine }}</span>
      <BridgeChip />
      <WebMcpChip />
      <button
        type="button"
        class="chat__watch"
        data-testid="ai-watch"
        :disabled="!chat.canWatch"
        :aria-pressed="timeline.watching ? 'true' : 'false'"
        :title="
          timeline.watching
            ? 'Back to your project'
            : chat.canWatch
              ? 'Show what the Assistant is building, read-only. Your project is unchanged.'
              : 'Available while the Assistant is working'
        "
        @click="agent.toggleWatch()"
      >
        Watch
      </button>
      <div class="chat__heights" role="group" aria-label="Assistant height">
        <button
          v-for="height in HEIGHTS"
          :key="height.id"
          type="button"
          class="chat__height"
          :aria-pressed="chat.sheet === height.id"
          :data-testid="`ai-sheet-${height.id}`"
          @click="chat.setSheet(height.id)"
        >
          {{ height.label }}
        </button>
      </div>
      <button type="button" class="chat__close" data-testid="assistant-close" aria-label="Close the assistant" @click="assistant.close()">
        ✕
      </button>
    </header>

    <template v-if="!peek">
      <div class="chat__meta">
        <p class="chat__connection" data-testid="assistant-connection" :data-status="assistant.status">
          <span data-testid="assistant-connection-text">{{ assistant.statusText }}</span>
        </p>
        <p class="chat__model">
          <template v-if="!assistant.mcpOnly && !assistant.browserAgentOnly">Model: <strong data-testid="assistant-model-name">{{ assistant.modelName }}</strong></template>
          <button v-if="!assistant.scripted" type="button" class="chat__link" data-testid="assistant-keys" @click="assistant.openKeySheet()">Key and model…</button>
          <ConnectButton testid="ai-connect-open" only-where-usable />
          <!-- Help for the Assistant (`TODO/ui-061`): at the end of the Model line, not in the header,
               which has no spare width at phone width (its extra row costs the log its height). -->
          <HelpButton topic="assistant" class="chat__help" />
        </p>
        <p v-if="chat.webMcpMessage" class="chat__warn" role="status" data-testid="ai-webmcp-message">{{ chat.webMcpMessage }}</p>
        <p v-if="assistant.storageNote" class="chat__warn" role="status" data-testid="assistant-storage-note">
          {{ assistant.storageNote }}
        </p>
      </div>

      <ol ref="log" class="chat__log" data-testid="ai-transcript" aria-live="polite">
        <li v-if="chat.items.length === 0" class="chat__empty" data-testid="ai-empty">
          Describe a part — “a 40 mm cube with a 10 mm hole through the middle” — and it appears in the viewport.
        </li>
        <template v-for="(item, index) in chat.items" :key="index">
          <li v-if="item.kind === 'user'" class="chat__bubble chat__bubble--user" data-testid="ai-user-message">
            {{ item.text }}<span v-if="item.images > 0" class="chat__images"> · {{ item.images }} image{{ item.images === 1 ? '' : 's' }}</span>
          </li>
          <li v-else-if="item.kind === 'assistant'" class="chat__bubble" data-testid="ai-assistant-message">{{ item.text }}</li>
          <li v-else-if="item.kind === 'tool'">
            <ActivityRow
              :item="item"
              :next="nextStepAfter(chat.items, index) ?? ''"
              :selectable="selectable(item)"
              @select="agent.selectBodies($event)"
            />
          </li>
          <li v-else-if="item.kind === 'notice'" class="chat__notice" :data-level="item.level" data-testid="ai-notice">{{ item.message }}</li>
        </template>
      </ol>

      <!-- TODO/ai-008: a proposed Save is pinned outside the scrolling log, so it is readable at phone height. -->
      <SaveProposal
        v-if="pinnedSave"
        :item="pinnedSave.item"
        :busy="chat.running"
        @confirm="agent.confirmSave(pinnedSave.index)"
        @cancel="agent.cancelSave(pinnedSave.index)"
      />

      <div class="chat__bar">
        <button
          type="button"
          class="chat__undo"
          data-testid="ai-undo-turn"
          :disabled="!chat.canUndoTurn"
          title="Take back everything the assistant did in its last turn"
          @click="agent.undoTurn()"
        >
          Undo AI turn
        </button>
        <button
          v-if="selectedBody"
          type="button"
          class="chat__chip"
          data-testid="ai-ask-selection"
          @click="askAboutSelection()"
        >
          Ask about {{ selectedBody.name }}
        </button>
        <TokenReadout :usage="chat.usage" :cost="chat.turnCost" :session="chat.sessionCost" />
      </div>

      <Composer />
    </template>
  </section>
</template>

<style scoped>
/* Phone and tablet first: a bottom sheet over the viewport, translucent so the model shows through. */
.chat {
  --chat-sheet-height: 36dvh;
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--kb-inset, 0px);
  z-index: 25;
  box-sizing: border-box;
  height: var(--chat-sheet-height);
  max-height: calc(100dvh - var(--kb-inset, 0px) - 60px);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 12px 10px;
  border-top: 1px solid var(--border-strong);
  border-radius: 12px 12px 0 0;
  background: color-mix(in srgb, var(--surface-1) 95%, transparent);
  backdrop-filter: blur(6px);
  color: var(--text-1);
}

.chat[data-sheet='peek'] {
  --chat-sheet-height: auto;
}

.chat[data-sheet='full'] {
  --chat-sheet-height: 60dvh;
}

.chat__help {
  /* A 44px target that adds no height to the Model line. */
  margin: -6px -8px -6px auto;
}

/* Never shrunk by the sheet's column: when the row wraps (a narrow column, the Browser agents
   chip), the header grows instead of drawing its second line over the text below. */
.chat__head {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  row-gap: 4px;
  min-height: var(--tap);
}

.chat__scripted {
  flex: none;
  padding: 2px 8px;
  border: 1px dashed var(--warn, #b7791f);
  border-radius: 999px;
  color: var(--warn, #b7791f);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.chat__title {
  font-size: 14px;
}

.chat__status {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-2);
}

.chat__heights {
  display: flex;
}

.chat__height,
.chat__watch,
.chat__close,
.chat__undo,
.chat__chip,
.chat__link {
  min-height: var(--tap);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.chat__height {
  min-width: 44px;
  padding: 0 8px;
  border-radius: 0;
}

.chat__height[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.chat__close {
  min-width: var(--tap);
}

/* `TODO/ai-017`: a 44px toggle; the accent when it is on, like the height buttons. */
.chat__watch {
  flex: none;
  min-width: var(--tap);
  padding: 0 8px;
}

.chat__watch[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.chat__watch:disabled {
  opacity: 0.5;
  cursor: default;
}

/* At phone width the status line holds the title, the status, Watch, three heights and Close:
   it wraps rather than pushing Close off-screen (the Scripted badge is what tips it over). */
@media (max-width: 480px) {
  .chat__head {
    flex-wrap: wrap;
  }
}

.chat__meta p {
  margin: 0;
}

.chat__connection {
  font-size: 12px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.chat__connection[data-status='failed'] {
  color: var(--danger);
}

.chat__model {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-2);
}

.chat__link {
  padding: 0 10px;
}

.chat__warn {
  font-size: 12px;
  color: var(--warn);
}

.chat__log {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat__empty,
.chat__notice {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.chat__notice[data-level='failed'] {
  color: var(--danger);
}

.chat__bubble {
  align-self: flex-start;
  max-width: 92%;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat__bubble--user {
  align-self: flex-end;
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-2));
}

.chat__images {
  color: var(--text-2);
}

.chat__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat__undo,
.chat__chip {
  padding: 0 12px;
}

.chat__undo:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Laptop: a persistent column beside the viewport (a grid cell of `.app__body`), not an overlay. */
/*
 * TODO/ai-008: while a Save proposal waits for an answer, the bottom sheet folds away the static
 * connection lines (the header's dot still shows the state), so the proposal, the bar and the
 * composer all fit the half-height sheet at phone size.
 */
@media (max-width: 1099px) {
  .chat--deciding .chat__meta {
    display: none;
  }
}

@media (min-width: 1100px) {
  .chat {
    position: static;
    height: auto;
    max-height: none;
    min-height: 0;
    border-top: 0;
    border-left: 1px solid var(--border-strong);
    border-radius: 0;
    background: var(--surface-1);
    backdrop-filter: none;
  }

  /* The fold/half/tall control is a small-screen device; a column has one height. */
  .chat__heights {
    display: none;
  }
}
</style>
