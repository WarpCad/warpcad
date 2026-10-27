<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The app's single root view.
 *
 * CLAUDE.md's Architecture section: no client-side router, no history-API
 * routes — the app is one screen, so this view mounts directly from
 * `src/main.js` rather than being resolved by a route. It is a thin composition
 * layer only (CLAUDE.md: "views must be thin"); everything with behaviour lives
 * in `src/components/viewport/`.
 *
 * This is also the view the reachability rule is checked against: a control that
 * is not reachable from here is not shipped, whatever its own tests say
 * (PREVIOUS-ATTEMPT.md's core failure).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import Inspector from '../components/inspector/Inspector.vue'
import DependentRepairDialog from '../components/inspector/DependentRepairDialog.vue'
import AssistantButton from '../components/ai/AssistantButton.vue'
import LiveMcpButton from '../components/ai/LiveMcpButton.vue'
import ChatPanel from '../components/ai/ChatPanel.vue'
import AiWorkingChip from '../components/display/AiWorkingChip.vue'
import KeySheet from '../components/ai/KeySheet.vue'
import SubscriptionRoute from '../components/ai/SubscriptionRoute.vue'
import ConnectClaudeCode from '../components/ai/ConnectClaudeCode.vue'
import MergeBanner from '../components/display/MergeBanner.vue'
import MergeToast from '../components/display/MergeToast.vue'
import RepeatToast from '../components/display/RepeatToast.vue'
import SaveStatus from '../components/display/SaveStatus.vue'
import FileMenu from '../components/storage/FileMenu.vue'
import { bootStorage } from '../composables/useStorageBoot.js'
import { useDeleteShortcut } from '../composables/useDeleteShortcut.js'
import { useHelpShortcut } from '../composables/useHelpShortcut.js'
import { useVisibilityShortcut } from '../composables/useVisibilityShortcut.js'
import { startLiveBridge } from '../composables/useLiveBridge.js'
import { startWebMcp } from '../composables/useWebMcp.js'
import HelpEntryButton from '../components/layout/HelpEntryButton.vue'
import HelpSheet from '../components/layout/HelpSheet.vue'
import ShareSheet from '../components/layout/ShareSheet.vue'
import SharedView from '../components/layout/SharedView.vue'
import { useShareLink } from '../composables/useShareLink.js'
import UpdateToast from '../components/layout/UpdateToast.vue'
import HistoryControls from '../components/layout/HistoryControls.vue'
import LibraryPanel from '../components/layout/LibraryPanel.vue'
import SaveToLibrarySheet from '../components/layout/SaveToLibrarySheet.vue'
import TimelinePanel from '../components/timeline/TimelinePanel.vue'
import TimelineStrips from '../components/timeline/TimelineStrips.vue'
import TimelineToggle from '../components/timeline/TimelineToggle.vue'
import Viewport from '../components/viewport/Viewport.vue'
import { useAiChatStore } from '../stores/aiChat.js'
import { useAppUpdateStore } from '../stores/appUpdate.js'
import { useAssistantStore } from '../stores/assistant.js'
import { useHostedStore } from '../stores/hosted.js'
import { useLibraryStore } from '../stores/library.js'
import { usePanelLayoutStore } from '../stores/panelLayout.js'
import { usePersistenceStore } from '../stores/persistence.js'
import { useRepeatStore } from '../stores/repeat.js'
import { useShareStore } from '../stores/share.js'
import { useSketchEditorStore } from '../stores/sketchEditor.js'
import { useTimelineStore } from '../stores/timeline.js'

// Restore the last autosaved session and start autosaving (`TODO/io-001`). Started on
// mount, not at store creation: the app renders first, the restore lands a moment later
// and frames the camera, and a slow or blocked store can never delay first paint.
//
// Then the hosted connection (`TODO/ui-033`): `io-002` deliberately left `hosted.start()`
// unwired until there was a File-button dot to say a restored auto-push connection is live.
// `bootStorage` runs it *after* the local restore has landed — see that module for why the
// order is load-bearing.
const persistence = usePersistenceStore()
const hosted = useHostedStore()
// The Assistant's stored key (`TODO/ai-004`): restored on mount so the header button's dot is
// right with every sheet closed. A blocked store just means "no key", never a startup failure.
const assistant = useAssistantStore()
const aiChat = useAiChatStore()
// The user's saved parts (`TODO/ui-055`): read from the local library into the registry's
// library layer on mount, so My parts is populated in every new project and after a reload.
// A blocked or empty store is an empty section, never a startup failure.
const library = useLibraryStore()
const appUpdate = useAppUpdateStore()
// A share link (`TODO/io-016`), read here in `setup` — beside where Help reads `#/help/<slug>`, and
// before `onMounted` boots storage, because opening a link suspends autosave first. While it shows,
// the Shared view replaces the editor below; it is never code-split behind a click.
const share = useShareStore()
const shareLink = useShareLink()
const sharedShowing = computed(() => share.phase !== 'off')
/** The chat sheet's state for CSS: its height name while open, `none` otherwise (`TODO/ai-006`). */
const chatSheet = computed(() => {
  if (assistant.view !== 'chat') return 'none'
  // `TODO/ui-071`: connected, the sheet is its compact header (unless folded, which is smaller still).
  return aiChat.bridge === 'connected' && aiChat.sheet !== 'peek' ? 'linked' : aiChat.sheet
})

// Delete / Backspace delete the selection (`TODO/ui-051`). Mounted here, not in the
// Inspector, so it works with the Inspector sheet collapsed.
useDeleteShortcut()
// `?` / F1 open the Help sheet (`TODO/ui-061`); the sheet itself is mounted once, below.
useHelpShortcut()
// H hides or shows the selection, Shift+H is Show all (`TODO/ui-089`) — the Objects list's
// eyes are the primary route; this mirrors them for a keyboard.
useVisibilityShortcut()
onMounted(() => {
  void bootStorage({ persistence, hosted })
  void assistant.start()
  void library.start()
  // `TODO/ai-012`: listen for Claude Code over the dev server's HMR socket (`npm run dev` only).
  startLiveBridge()
  // `TODO/ai-021`: register the tools for in-browser agents when the browser has WebMCP (default on).
  void startWebMcp()
})

/**
 * Whether the Inspector's phone-width bottom sheet is currently open.
 *
 * The Inspector owns *when* it opens — selection is its trigger, and control 3's
 * Q16 says it auto-opens with no extra tap. What this view owns is the
 * consequence for everything underneath: while the sheet is up, the viewport's
 * own overlays (nav chrome, scale readout) inset above it rather than
 * disappearing behind it. `ui-010`'s hand-drive found exactly that defect with
 * the Library sheet — a passing spec could not see it — so the inset is wired
 * for this sheet from the start rather than after someone notices.
 */
/** @type {import('vue').Ref<'none' | 'tab' | 'open'>} */
const inspectorSheet = ref('none')

/** The Repeat session (`TODO/ui-069`): at phone width its shrunk bar lifts the Inspector sheet. */
const repeat = useRepeatStore()

/**
 * Whether the Library's phone-width bottom sheet is up.
 *
 * At phone width there is exactly one bottom-sheet slot and both panels want it.
 * `ui-011`'s acceptance drive found them stacking into unreadable mush, so this
 * view — the composition layer, and the only thing that can see both — arbitrates
 * it. Panel layout is UI state, which CLAUDE.md puts squarely here.
 *
 * The arbitration is deliberately asymmetric, because the two panels are not
 * symmetric in intent: opening the Library is something the user *asked* for, so
 * the Inspector declines to auto-open over it (`librarySheetOpen` below), while
 * deliberately opening the Inspector — tapping its tab — collapses the Library
 * (`libraryCollapse`). A drop never closes the Library, because placing several
 * shapes in a row is exactly what `TODO/ACCEPTANCE.md` scenario 1 does.
 */
const libraryOpen = ref(false)
/** Bumped to tell the Library the Inspector has claimed the sheet slot. */
const libraryCollapse = ref(0)

/**
 * The History panel joins the same one-sheet-slot argument (`TODO/ui-032`, §13).
 *
 * There is now a third panel that wants the phone's single bottom-sheet slot,
 * and §13 settles the arbitration in the same asymmetric shape the other two
 * already use — opening History is something the user *asked* for, so:
 *
 * - opening History collapses the Library sheet (below);
 * - while History is open the Inspector **declines to auto-open on selection**,
 *   exactly as it already declines over an open Library;
 * - tapping the Inspector's tab closes History (it emits `claim-sheet`).
 *
 * Nothing new was invented for this: the Inspector's existing "something else
 * owns the slot" input is reused, which is why it is now named for the slot
 * rather than for the Library specifically.
 */
const timeline = useTimelineStore()

/**
 * Three claimants for the one phone sheet slot — Library, History, Inspector. There
 * used to be a fourth, the Objects panel (`TODO/ui-041`); `TODO/ui-049` folded its list
 * into the Inspector, so the list now rides the Inspector's own sheet and needs no slot
 * of its own.
 */
const sheetSlotClaimed = computed(() => libraryOpen.value || timeline.open)

/**
 * Whether an open sheet is pushing the viewport's nav chrome up off the bottom edge
 * (`TODO/ui-046`) — exactly the three states the `--viewport-bottom-inset` rules
 * below raise it for, and no others.
 *
 * Raised, the full chrome sat over ~194×200px of live canvas at 390px, and a real tap
 * on a body underneath landed on `nav-step-right` and silently orbited the camera. The
 * chrome collapses to a single toggle in this state; it gates that on its own
 * `≤640px` media query, so this flag being true at laptop width (the History dock is
 * "open" there too) changes nothing.
 */
const navRaised = computed(() => inspectorSheet.value === 'open' || timeline.open || chatSheet.value !== 'none')

watch(
  () => timeline.open,
  (open) => {
    if (open) libraryCollapse.value += 1
  },
  { flush: 'sync' }
)

/**
 * Opening the phone Library sheet is the same deliberate claim, in the other direction.
 *
 * Found by hand-driving at 390px while building the Objects list (`ui-041`): with
 * History open, tapping the Library tab put its sheet *behind* the panel — the tab and
 * half a list of shapes showing through the top of it. Only ever fires at phone width:
 * at ≥641px the Library is a column and `libraryOpen` never turns on.
 */
watch(
  libraryOpen,
  (open) => {
    if (!open) return
    timeline.setOpen(false)
  },
  { flush: 'sync' }
)

/**
 * Opening the sketch editor gives it the viewport (`TODO/sketch-001`): a Sketch dragged
 * out of the phone Library sheet would otherwise open its editor *under* that sheet, and
 * the open History sheet would sit over the drawing plane the same way.
 */
const sketchEditor = useSketchEditorStore()
watch(
  () => sketchEditor.active,
  (active) => {
    if (!active) return
    libraryCollapse.value += 1
    // Only the phone *sheet* covers the plane; at wider widths History is a dock beside
    // the viewport, and closing it would just lose the user's place.
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches) timeline.setOpen(false)
  },
  { flush: 'sync' }
)

/**
 * Opening the Assistant's chat is the same deliberate claim (`TODO/ai-006`): at phone width the
 * Library sheet would otherwise sit *under* the translucent chat sheet and show through it (found
 * by looking at the phone screenshot of the hand-drive — no assertion could see it). The chat
 * sheet covers the whole slot, so the Library folds and the History sheet closes. Phone only:
 * from 641px the Library is a column and History a dock, and nothing is underneath.
 */
watch(
  chatSheet,
  (sheet) => {
    if (sheet === 'none') return
    if (typeof window === 'undefined' || !window.matchMedia?.('(max-width: 640px)').matches) return
    libraryCollapse.value += 1
    timeline.setOpen(false)
  },
  { flush: 'sync' }
)

/**
 * The tiered panel layout between laptop and phone width (`TODO/ui-079`): one `ResizeObserver` on
 * `.app__body` writes one number to the layout store and nothing else; Vue batches the re-render
 * and no component reads layout in response. The grid's side tracks come from the store as
 * `--library-width` / `--inspector-width`, so they ease continuously as a window edge is dragged
 * instead of jumping at 1100px. The chat's open state is the store's other input: from 1100px an
 * open chat is a grid column, which takes 340px away from the three panels.
 */
const panelLayout = usePanelLayoutStore()
/** @type {import('vue').Ref<HTMLElement | null>} */
const appBody = ref(null)
/** @type {ResizeObserver | null} */
let bodyObserver = null
watch(chatSheet, (sheet) => panelLayout.setChatColumn(sheet !== 'none'), { immediate: true, flush: 'sync' })
// Watched rather than read once on mount: behind a share link (`TODO/io-016`) the editor, and so
// `.app__body`, first appears when the Shared view is left.
watch(
  appBody,
  (body) => {
    bodyObserver?.disconnect()
    bodyObserver = null
    if (!body || typeof ResizeObserver === 'undefined') return
    bodyObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) panelLayout.setBodyWidth(entry.contentRect.width)
    })
    bodyObserver.observe(body)
  },
  { flush: 'post' },
)
onBeforeUnmount(() => bodyObserver?.disconnect())
// The editor's sheets unmount behind the Shared view; their last reported state must not outlive them.
watch(sharedShowing, (showing) => {
  if (!showing) return
  inspectorSheet.value = 'none'
  libraryOpen.value = false
})

/**
 * The grid's own track transition has run (`TODO/ui-079` stage 7): a growing panel's wide content
 * can come in now. Only `.app__body`'s `grid-template-columns`; a child's transition bubbles here
 * too and must not end the hold early. The store's timer covers an engine where this never fires.
 *
 * @param {TransitionEvent} event
 */
function onBodyTransitionEnd(event) {
  if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-columns') return
  panelLayout.finishTrackAnimation()
}

/** `.app__body`'s inline custom properties: the side tracks, the gizmo reserve, and the linked chat's height. */
const bodyStyle = computed(() => {
  /** @type {Record<string, string>} */
  const style = {
    // The store's target track, applied as-is in every tier (`TODO/ui-084` removed the 200px hold
    // that stood in for the icon rail until it existed).
    '--library-width': `${panelLayout.layout.libraryWidthPx}px`,
    '--inspector-width': `${panelLayout.layout.inspectorWidthPx}px`,
    // How much width the Operations toolbar leaves for the orientation gizmo (`TODO/ui-084`).
    '--gizmo-reserve': `${panelLayout.layout.gizmoReservePx}px`,
  }
  if (chatSheet.value === 'linked' && aiChat.linkedHeight > 0) style['--chat-linked-height'] = `${aiChat.linkedHeight}px`
  return style
})

/** Tapping the Inspector's tab is a deliberate claim on the slot — the Library and History yield. */
function onInspectorClaim() {
  libraryCollapse.value += 1
  timeline.setOpen(false)
}
</script>

<template>
  <div class="app" data-testid="app-root">
    <!-- The Shared view (TODO/io-016): someone's project from a link, read-only, in place of the
         whole editor — no toolbar, timeline, library, inspector, assistant or File menu. -->
    <SharedView v-if="sharedShowing" @start="shareLink.leave()" />
    <template v-else>
    <header class="app__bar" data-testid="app-header">
      <!-- The title and the version label (`TODO/ui-077`): read-only, always shown, never wraps.
           Beside the title on a laptop; stacked under it at phone width, where the row has no room
           for a second item (the stack uses the bar's spare height, not its width). The full build
           string stays in Help's version row (`help-version`). -->
      <div class="app__title-group">
        <h1 class="app__title">WarpCad</h1>
        <span class="app__version" data-testid="app-version">{{ appUpdate.versionLabel }}</span>
      </div>
      <p class="app__hint" data-testid="app-hint">
        Drag a shape in from the Library · click a shape to inspect it · drag to orbit
      </p>
      <!-- The "document bar" cluster (`docs/decisions/interaction-model-qa.md`,
           cross-cutting): document-level controls that are not gated on
           selection, right-aligned in the one strip that is always visible.
           `data-003` fills the first two slots and the save-status chip (`io-001`)
           the last; the History toggle (`ui-032`) and File ▾ (`ui-033`, which
           `ui-034`'s Export… joins) sit in between without moving either. -->
      <div class="app__document-bar" data-testid="document-bar">
        <HistoryControls />
        <TimelineToggle />
        <!-- TODO/io-016: send the whole project as a link, left of File ▾. -->
        <ShareSheet />
        <FileMenu />
        <HelpEntryButton />
        <SaveStatus />
      </div>
      <!-- While an Assistant turn runs (TODO/ai-017): visible with the panel closed, since the
           user keeps editing during a turn. Beside the button that opens the turn's controls. -->
      <AiWorkingChip />
      <!-- App-level, not document-level (`TODO/ai-004`): always present, never gated on a
           selection or a key; with no key it opens the key sheet. -->
      <!-- Phone only (TODO/ui-075): the way to Live MCP access the laptop-only panel row can't give. -->
      <LiveMcpButton />
      <AssistantButton />
    </header>
    <!-- Between the header and the main area, deliberately outside the viewport
         (§14): the viewport's own four corners are already spoken for, and
         `ui-015`'s retirement note is what a control growing into the
         orientation gizmo's corner actually costs. -->
    <!-- What a Merge file… brought in (TODO/ui-062): in flow and full width, so at phone width
         it sits at the top of the viewport under the header and pushes it down instead of
         covering the Operations toolbar or the nav chrome. -->
    <MergeToast />
    <!-- What a Repeat's Apply did, with Undo (TODO/ui-069): the same in-flow slot. -->
    <RepeatToast />
    <MergeBanner />
    <TimelineStrips />
    <main
      ref="appBody"
      class="app__body"
      :data-library-tier="panelLayout.layout.libraryTier"
      :data-ops-tier="panelLayout.layout.opsTier"
      :data-chrome-tier="panelLayout.layout.chromeTier"
      :data-panel-animating="panelLayout.animating ? 'true' : null"
      :data-inspector-sheet="inspectorSheet"
      :data-library-sheet="libraryOpen ? 'open' : 'closed'"
      :data-timeline-sheet="timeline.open ? 'open' : 'none'"
      :data-chat-sheet="chatSheet"
      :style="bodyStyle"
      :data-repeat-bar="repeat.armed && repeat.minimized ? 'true' : 'false'"
      @transitionend="onBodyTransitionEnd"
    >
      <LibraryPanel
        :collapse-signal="libraryCollapse"
        @open-change="libraryOpen = $event"
      />
      <!-- The viewport column, which the History dock shares at ≥641px and
           which the History sheet overlays at phone width. -->
      <div class="app__stage">
        <Viewport :nav-raised="navRaised" />
        <TimelinePanel />
      </div>
      <Inspector
        :sheet-slot-claimed="sheetSlotClaimed"
        @sheet-change="inspectorSheet = $event"
        @claim-sheet="onInspectorClaim()"
      />
      <!-- The Assistant's chat (TODO/ai-006): a bottom sheet over the viewport at phone and
           tablet width, a column of this grid at laptop width. Never a modal. -->
      <ChatPanel />
    </main>
    <!-- A newer build is installed (TODO/build-005): the last row of the column, in flow, so it
         pushes the viewport up instead of covering the navigation chrome, gizmo or chat sheet. -->
    <UpdateToast />
    <!-- The repair dialog (TODO/ui-052): over everything, opened by an Inspector
         dropdown, a History row's Edit, or a Resolve… button. -->
    <DependentRepairDialog />
    <!-- The Assistant's key sheet (TODO/ai-004), opened by the header button when there is no
         key or from the chat's "Key and model…"; teleports to <body> at the modal tier. -->
    <KeySheet />
    <!-- The no-key alternative (TODO/ai-013): the Claude Code route, which a subscription covers. -->
    <SubscriptionRoute />
    <!-- The live MCP access sheet (TODO/ai-023): a local MCP client edits this open project. -->
    <ConnectClaudeCode />
    <!-- The Save to library… sheet and its "Saved <name>" toast (TODO/ui-055). -->
    <SaveToLibrarySheet />
    </template>
    <!-- The in-app docs (TODO/ui-061): over every pop-up (modal tier 50/51), opened by any ? button,
         File ▾ → Help or the ? / F1 keys. Outside the editor so a help link still works whatever shows. -->
    <HelpSheet />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-0);
}

.app__bar {
  display: flex;
  /* Centred, not baseline-aligned, since `data-003`: the bar now holds 44px tap
     targets as well as text, and a baseline would hang them off the title's
     text baseline instead of centring them in the strip. */
  align-items: center;
  gap: 12px;
  /* Tighter than the old 8px because the 44px controls now set the bar's height
     (~52px at phone width, up from ~30px). The cross-cutting decision calls that
     growth a deliberate cost; there is no reason to add to it with padding. */
  padding: 4px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.app__document-bar {
  /* Right-aligned, and the thing that pushes it there — so the cluster stays put
     as `ui-032`/`ui-033` add controls beside it. */
  margin-left: auto;
  /* May shrink below its content (`TODO/io-016`): the save-status chip's nowrap notice otherwise sets
     the cluster's minimum, and a long "Opened <name> · N steps" pushed the Assistant button off the
     820px tablet row. The hint gives way first (`.app__hint`'s shrink weight), then only the chip (to
     its own 132px floor, ellipsised); every button keeps its size. */
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.app__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--text-1);
}

/* `TODO/ui-077`: the version label never wraps and never shrinks away; the hint truncates first. */
.app__title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.app__version {
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.2;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 480px) {
  /* Stacked under the title: the row is full at 390px, but the bar has ~10px of spare height. */
  .app__title-group {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .app__version {
    font-size: 10px;
  }
}

.app__hint {
  /* Gives way before the document bar does (`TODO/io-016`): shrink is weighted by size, and without
     this the shrinkable bar would take part of the squeeze while the hint still had room. */
  flex-shrink: 1000;
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  /* Never force horizontal scrolling of primary UI at phone width
     (CLAUDE.md Responsive Layout). */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app__stage {
  /* The viewport column. A flex column at ≥641px so the History dock takes a
     fixed slice off the bottom and the viewport keeps the rest; `position:
     relative` so the phone-width History sheet can overlay the viewport
     without escaping the column. */
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* The viewport takes whatever the History dock leaves. `min-height: 0` is the
   load-bearing half: without it a flex child refuses to shrink below its
   content and the dock would push the canvas off the bottom of the column
   instead of sharing it. */
.app__stage > :deep(.viewport) {
  flex: 1 1 auto;
  min-height: 0;
}

/*
 * The panel budget between laptop and phone width (`TODO/ui-079`). One number drives it: `W`, the
 * width of `.app__body` (a `ResizeObserver`). `E = W − 340` when the chat is a grid column (W ≥ 1100
 * and the chat is open), else `E = W`. `L`/`I` are the Library/Inspector target tracks and
 * `P = E − L − I` the *computed* viewport pane. `panelLayoutFor` in `src/stores/panelLayout.js` is
 * the code, and its spec enforces the invariants; this table must match it.
 *
 * Measured in stage 1 at 1440×900 in Chromium / WebKit / Firefox (widest engine used):
 *   Operations row, labelled, one line ........... 1040 / 1064 / 1072px (14 buttons)
 *   Operations row, icon-only (44px, gap 4) ...... 668px in all three
 *   `.ops` for labelled in ≤ 2 lines ............. 541 / 554 / 559px  → labels while P ≥ 559 + 208 + 5 = 772
 *   `.ops` for icons in ≤ 3 lines ................ 250px in all three  → icons while P ≥ 250 + 208 = 458
 *   (`.ops` is capped at P − 24 − 184, `ui-015`'s gizmo-avoiding cap, in every tier)
 *   Orientation gizmo ............................ 130×177 / 178 / 179px, 12px in from the top right
 *   Navigation chrome (bottom left) .............. 205–209×188px; scale readout (bottom right) 163×50–52px
 *   Library catalogue ............................ 24 rows in 6 headed sections (My parts empty); as a
 *     44px-tile rail that is ~1240px tall with dividers and the ? / ⋯ tiles, so the rail scrolls even
 *     at the 820×1180 tablet (1127px body). The 7-launcher section rail is ~410px (44px + 10px name).
 *
 * `TODO/ui-084` stage 1 added the viewport chrome's compact tier (Chromium / WebKit / Firefox):
 *   Navigation pad, compact (the ≤ 480px form) ..... 190 / 194 / 194 × 164px, 8px in from the bottom left
 *   Orientation gizmo, compact ..................... 106 × 138px in all three, 8px in from the top right
 *   Gizmo reserve (`--gizmo-reserve`, below) ....... 184px full (130 + 12 + 42); 150px compact (106 + 8 + 36)
 *   → chrome compact while P < 554: the full reserve leaves the 14-button icon row two lines only from
 *     P − 24 − 184 − 14 ≥ 7 × 44 + 6 × 4 = 332. The compact reserve keeps the tablet (P = 523) on two lines.
 *
 *   | E (no chat)  | Library        | L (px)            | I (px)            | P (px)    | Operations | Chrome  |
 *   |--------------|----------------|-------------------|-------------------|-----------|------------|---------|
 *   | ≥ 1276       | labels         | 224 → 240 at 1440 | 279.5 → 280       | ≥ 772     | labels     | full    |
 *   | 1024 – 1275  | labels         | 200 – 224         | 249 – 279         | 575 – 771 | icons      | full    |
 *   | 855 – 1023   | icons (rail)   | 72                | 229 – 249         | 554 – 702 | icons      | full    |
 *   | 790 – 854    | icons (rail)   | 72                | 221 – 229         | 497 – 553 | icons      | compact |
 *   | 742 – 789    | pop-out (rail) | 64                | 220 – 221         | 458 – 504 | icons      | compact |
 *   | 641 – 741    | pop-out (rail) | 64                | 220               | 357 – 457 | groups     | compact |
 *   | ≤ 640        | phone sheet    | —                 | —                 | —         | phone icons| phone   |
 *
 *   I eases 220 → 280 linearly over E 780 → 1280; L eases 200 → 240 over E 1024 → 1440. Breakpoints
 *   moved from the provisional plan by measurement: Operations labels 1260 → 1276 (Firefox's labels
 *   need P ≥ 772 for two lines), Operations groups 734 → 742 (icons need P ≥ 458 for three lines),
 *   and so Library pop-out 780 → 790 (to stay 40px from 742; 820 is still 30px clear).
 *   The tablet (820) is Library icons / Operations icons / chrome compact with P ≈ 523; the laptop
 *   with the chat open (E = 1100) is Library labels at ~207px / Operations icons / chrome full.
 *   Shrinking order: Operations icons 1276, Library icons 1024, chrome compact 855, Library pop-out
 *   790, Operations groups 742, phone 640. "phone" chrome is the ≤ 480px media query, unchanged.
 *
 * The applied Library track is the store's target in every tier. The pop-out tier is the section
 * launchers (`TODO/ui-081`) in its 64px track.
 *
 * Motion (stage 7): a tier change sets `data-panel-animating` for 220ms and the tracks ease over
 * 180ms; the panels' content swaps compact-first when shrinking and only after the track has widened
 * when growing (`contentTierFor`); a placement drag holds the Library's content until `pointerup`.
 * Reduced motion makes all of it instant. A fluid width change inside a tier is never animated.
 */
.app__body {
  position: relative;
  display: grid;
  /* How much of the viewport's bottom edge the Library sheet's collapsed tab
     covers. The viewport's own overlays (nav chrome, scale readout) subtract
     this so the sheet never sits on top of a control — found by looking at a
     phone-width screenshot during ui-010's acceptance drive, which is exactly
     the class of bug a passing spec cannot see. Zero at widths where the
     Library is a column instead of a sheet. */
  --viewport-bottom-inset: 0px;
  /* Height of the Library sheet's collapsed tab. The Inspector sheet stacks
     directly on top of it rather than over it, so it reads the same number. */
  --library-tab-height: 52px;
  /* How tall the Inspector sheet is allowed to get at phone width, and how tall
     its collapsed tab is — both kept in step with the panel's own values. */
  --inspector-sheet-height: 38vh;
  --inspector-tab-height: 44px;
  /* The Repeat panel's shrunk bar at phone width (`RepeatSheet.vue`, `TODO/ui-069`). */
  --repeat-bar-height: 54px;
  /* How tall the History sheet is at phone width, and how far up from the
     bottom edge it has to start so the Library and Inspector tabs are not
     sitting on top of its last rows. Zero offset at widths where History is a
     dock rather than a sheet. `TimelinePanel.vue` reads both.

     **34vh, not the 46vh §13 sketched, and the number is arithmetic rather
     than taste.** At 390×844 the viewport is 791px, the Operations toolbar
     wraps to 167px and the nav chrome is 200px — 367px of controls that both
     have to stay on screen. The sheet's total claim on the bottom edge is
     `bottom + height + 12`, and the chrome is pushed up by exactly that, so
     keeping the chrome clear of the toolbar needs `bottom + height + 12 ≤
     844 − 200 − 228`, i.e. a height of at most ~308px against a 96px offset.
     46vh (388px) overlapped them by a measured 44px — the nav chrome landing
     *inside* the toolbar, which is `CLAUDE.md`'s "a panel that only works by
     covering a control" failure outright. Found by hand-driving scenario 12 at
     phone width, not by a spec. */
  --bottom-panel-height: 34vh;
  --bottom-panel-bottom: 0px;
  /* Phone first (CLAUDE.md Responsive Layout): one column, the viewport, with
     the Library panel and the Inspector overlaying it as bottom sheets. The
     persistent columns below are the wide-screen case, not the default. */
  grid-template-columns: 1fr;
  flex: 1;
  min-height: 0;
}

@media (max-width: 640px) {
  .app__body {
    /* The collapsed tab's 44px tap target plus its border and breathing room. */
    --viewport-bottom-inset: var(--library-tab-height);
  }

  /* The viewport's own controls sit above whatever the Inspector is currently
     covering — never behind it. Three states, not two: a *collapsed* sheet still
     puts its 44px tab over the 3D view, and treating that as "nothing" is what
     left the scale readout half-hidden in ui-011's acceptance drive. */
  .app__body[data-inspector-sheet='tab'] {
    --viewport-bottom-inset: calc(var(--library-tab-height) + var(--inspector-tab-height));
  }

  .app__body[data-inspector-sheet='open'] {
    --viewport-bottom-inset: calc(
      var(--library-tab-height) + var(--inspector-tab-height) + var(--inspector-sheet-height) + 12px
    );
  }

  /* The History sheet claims the slot outright (§13: the Inspector declines to
     auto-open while it is up), so it wins the inset rather than stacking on
     top of the others. Last rule wins at equal specificity — which is why this
     sits below the Inspector's two, deliberately. The same reasoning
     `ui-010`'s hand-drive forced for the Library tab: a sheet that covers the
     nav chrome and the scale readout is a defect a passing spec cannot see. */
  /* The History sheet clears the Library tab always, and the Inspector's tab
     whenever that is showing too. Found by hand-driving scenario 12 at 390×844
     in WebKit: with a body selected, the Inspector's 44px tab sat on top of the
     sheet's last row and silently swallowed taps on it — the same
     tab-covers-a-control defect `ui-010`'s own acceptance drive found with the
     Library tab and the nav chrome, and equally invisible to a passing spec
     that happened to tap a row higher up the list. */
  .app__body {
    --bottom-panel-bottom: var(--library-tab-height);
  }

  .app__body[data-inspector-sheet='tab'],
  .app__body[data-inspector-sheet='open'] {
    --bottom-panel-bottom: calc(var(--library-tab-height) + var(--inspector-tab-height));
  }

  /* An open Library sheet with the Inspector as a tab (`TODO/ui-070`): stack, don't overlap.
     The Inspector's tab docks on the bottom edge and the whole Library panel lifts above it,
     the same move `--bottom-panel-bottom` makes for History. Otherwise the tab (z 11) is drawn
     across the sheet's rows, which the Library grows upward from the bottom edge. */
  .app__body[data-library-sheet='open'][data-inspector-sheet='tab'] {
    --inspector-bottom: 0px;
    --library-bottom: var(--inspector-tab-height);
  }

  /* The Repeat bar sits on the Library tab; the Inspector sheet lifts over it so the bar never
     covers the sheet's sticky Delete row. An open Library sheet (the rule above) still wins. */
  .app__body[data-repeat-bar='true'] {
    --inspector-bottom: calc(var(--library-tab-height) + var(--repeat-bar-height));
    --viewport-bottom-inset: calc(var(--library-tab-height) + var(--repeat-bar-height));
  }

  .app__body[data-repeat-bar='true'][data-inspector-sheet='tab'] {
    --viewport-bottom-inset: calc(
      var(--library-tab-height) + var(--repeat-bar-height) + var(--inspector-tab-height)
    );
  }

  .app__body[data-repeat-bar='true'][data-inspector-sheet='open'] {
    --viewport-bottom-inset: calc(
      var(--library-tab-height) + var(--repeat-bar-height) + var(--inspector-tab-height) +
        var(--inspector-sheet-height) + 12px
    );
  }

  .app__body[data-timeline-sheet='open'] {
    --viewport-bottom-inset: calc(
      var(--bottom-panel-bottom) + var(--bottom-panel-height) + 12px
    );
  }
}

/* Persistent side panels, their widths from the layout store (`TODO/ui-079`) rather than fixed
   210/220/280px tracks that jumped at 1100px. The phone switch itself stays this media query, not
   the store's `phone` flag, because every panel's own sheet-or-column switch (Library, Inspector,
   History, chat) is a `max-width: 640px` media query, and the grid has to agree with them exactly. */
@media (min-width: 641px) {
  .app__body {
    grid-template-columns: var(--library-width, 200px) 1fr var(--inspector-width, 220px);
  }

  /* `TODO/ui-079` stage 7: only a *tier* change animates the tracks. The store sets this flag for
     220ms on one (`PANEL_ANIMATING_MS`); a width change inside a tier never sets it, so dragging a
     window edge keeps the fluid tracks on the edge instead of rubber-banding behind it. The flag
     and the new tracks land in the same style change, which is what starts the transition. All
     three engines interpolate these `var()`-built tracks (the e2e samples the in-between widths). */
  .app__body[data-panel-animating] {
    transition: grid-template-columns 180ms ease-out;
  }
}

@media (prefers-reduced-motion: reduce) {
  /* The store never sets the flag under reduced motion; this covers the setting changing mid-way. */
  .app__body[data-panel-animating] {
    transition: none;
  }
}

@media (max-width: 640px) {
  /* The hint is mouse-oriented prose ("drag to orbit") that already truncated to
     nothing at 390px, and the document-bar cluster needs the width more. Hidden
     rather than shrunk, per the cross-cutting phone budget: title ~60px + Undo
     44 + Redo 44 + the controls still to come + gaps ≈ 320px at 390px wide. */
  .app__hint {
    display: none;
  }
}

/* `TODO/io-016`: the dev host's phone header also carries the Live MCP entry (`ui-075`, dev-only), and
   with Share as well the row is 45px too wide (measured 435px at 390). There, and only there, Share
   steps out of the row and **File ▾ → Share…** is its route — the precedent `HelpEntryButton` set.
   A hosted copy has no Live MCP entry, so its phone header keeps Share (measured: exactly 390px). */
@media (max-width: 480px) {
  .app__bar:has([data-testid='live-mcp-button']) :deep(.share-root) {
    display: none;
  }
}

@media (max-width: 480px) {
  .app__bar {
    padding: 4px 6px;
    /* `TODO/ui-075`: the Live MCP access entry is a ninth 44px item in the ~390px row; tighter gaps
       (not smaller targets) are what pay for it. */
    gap: 4px;
  }

  .app__document-bar {
    gap: 4px;
  }

  .app__title {
    /* `TODO/ui-075`: Firefox counts the bar's right padding in `scrollWidth`, so the row has to
       end inside the padding, not just inside the viewport; 13px with no tracking buys ~9px. */
    font-size: 13px;
    letter-spacing: 0;
  }

  .app__hint {
    font-size: 11px;
  }
}

/* The Assistant's chat sheet (TODO/ai-006), phone and tablet: the viewport's overlays (nav chrome,
   scale readout) sit above the sheet at whichever height it is, never behind it. Last in the file
   so it wins over the Inspector/History insets above: the chat sheet is on top of both. */
@media (max-width: 1099px) {
  .app__body[data-chat-sheet='peek'] {
    --viewport-bottom-inset: 96px;
  }

  .app__body[data-chat-sheet='half'] {
    --viewport-bottom-inset: calc(36dvh + 12px);
  }

  .app__body[data-chat-sheet='full'] {
    --viewport-bottom-inset: calc(60dvh + 12px);
  }

  /* `TODO/ui-071`: an MCP agent is connected, so the sheet is its measured compact height. */
  .app__body[data-chat-sheet='linked'] {
    --viewport-bottom-inset: calc(var(--chat-linked-height, 160px) + 12px);
  }
}

/* Laptop: the chat is a persistent column, an explicit fourth grid cell. */
@media (min-width: 1100px) {
  /* The fourth track stays on this media query so it always agrees with `ChatPanel.vue`'s own
     sheet-or-column switch (`max-width: 1099px`); the store takes the same 340px off `E`. */
  .app__body:not([data-chat-sheet='none']) {
    grid-template-columns: var(--library-width, 200px) 1fr var(--inspector-width, 280px) 340px;
  }

  .app__body > :deep(.chat) {
    grid-column: 4;
    grid-row: 1;
  }
}

/* Phone: while the chat sheet is up it owns the whole bottom slot, so the other sheets (Library,
   Inspector, History) are hidden — not unmounted, so nothing loses its state — instead of showing
   through or poking out above it. They come back when the chat closes. */
@media (max-width: 640px) {
  .app__body:not([data-chat-sheet='none']) :is([data-testid='library-panel'], [data-testid='inspector'], [data-testid='timeline-panel']) {
    visibility: hidden;
  }
}
</style>
