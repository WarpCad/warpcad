// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Publish the open project as a GitHub gist, update it, stop sharing it (`TODO/io-017`, Stage 2).
 * Orchestration only, for the Share sheet's gist group to bind to: the client is
 * `src/storage/gistBackend.js` (through `stores/gist.js`, which holds the token), the README is
 * `src/core/gistReadme.js`, the links are `src/core/gistLink.js`, the wording
 * `src/core/gistMessages.js`, and the gist the project is published as is the **document's**
 * `gist` field (`src/core/gistField.js`).
 *
 * ## Nothing is uploaded on its own
 *
 * Every call to GitHub here is inside {@link publish}, {@link update} or {@link stop}, each the
 * answer to a button. Nothing watches the document, autosave or a load; creating the composable
 * reads nothing and sends nothing.
 *
 * ## Publish is two calls
 *
 * The README's **Open in WarpCad** link needs the gist id, which exists only once the gist does:
 * `createGist` with the project file and a placeholder README (no id, so no link), the field set,
 * then `updateGist` with the real README. If that second call fails the gist still exists and the
 * short link works; the result says `warning: 'readme'`, and the next update writes the README.
 * The README's file link is the **revision-free** raw URL (`gistRawFileUrl`), so it always
 * serves the latest publish.
 *
 * ## Update refuses if the gist changed (the interim rule)
 *
 * Before patching, the gist is read and its revision compared with the field's `lastRevision`.
 * A different revision means someone else's write came in between (another device, an edit on
 * github.com): nothing is written and the result is `changed-remotely` — "open it first". The
 * merge that would replace this rule is Stage 3 (`docs/decisions/gist-storage.md`). A revision
 * this session wrote itself is not someone else's change (GitHub serves a read up to 60 s old).
 *
 * ## The project file is Download copy's bytes
 *
 * `serializeProject` of the live document, the one serializer **Download copy** and autosave use.
 * Its README carries the project's name and body names only — never intent text, standing
 * instructions or the AI conversation (`gistReadme.js` has no field that could hold them).
 *
 * ## The field is set through the command layer
 *
 * `setGist(value, { origin: 'gist' })` on the document — origin-tagged, not an undo step (it
 * records an external fact) — then the store's `refresh()` so autosave and the chip follow it. A
 * project replaced while a call was in flight (Open, New, a share copy) never gets the field.
 *
 * ## Two entry points, one implementation (`TODO/io-021`)
 *
 * The Share sheet's gist group and **File ▾ → Save as gist… / Save to gist**
 * (`stores/fileMenu.js`) both call these same three functions. A publish or update that sets the
 * field on the open project tells the persistence store (`noteGistSaved`), so the save chip reads
 * *Saved to gist · 14:05* and then how many changes the gist is behind; nothing saves to the gist
 * by itself.
 *
 * @module composables/useGistPublish
 */

import { computed, toRaw } from 'vue'

import { gistFileName, gistLink, gistRawFileUrl } from '../core/gistLink.js'
import { gistFailureOf, gistMessage, plainGistDescription } from '../core/gistMessages.js'
import { gistReadme } from '../core/gistReadme.js'
import { serializeProject } from '../core/project.js'
import { DEFAULT_SHARE_NAME } from '../core/shareLink.js'
import { useDocumentStore } from '../stores/document.js'
import { useGistStore } from '../stores/gist.js'
import { usePersistenceStore } from '../stores/persistence.js'

/** The transaction origin the gist field is written under. */
export const GIST_ORIGIN = 'gist'

/** The README's file name in the gist. */
const README = 'README.md'

/** @typedef {import('../core/gistMessages.js').GistMessageKind} GistMessageKind */
/** @typedef {import('../core/gistMessages.js').GistFailure} GistFailure */
/** @typedef {import('../core/gistField.js').GistField} GistField */

/**
 * A successful publish or update. `warning`: `readme` — published, but the README patch failed;
 * `project-changed` — the gist was written, but the project was replaced meanwhile, so the field
 *
 * was not set on the new one. `name` is the gist's title as written (`TODO/io-021`'s toast names it).
 *
 * @typedef {{ ok: true, id: string, link: string, revision: string, name: string, warning?: 'readme' | 'project-changed' }} GistPublishOk
 */

/**
 * @param {GistMessageKind} kind
 * @param {import('../core/gistMessages.js').GistMessageContext} context
 * @returns {GistFailure}
 */
function fail(kind, context) {
  return { ok: false, kind, message: gistMessage(kind, context) }
}

/**
 * The Share sheet's gist group, as state and three actions.
 *
 * @param {{ now?: () => number }} [options] `now` — the clock the README's "Last published" reads.
 */
export function useGistPublish(options = {}) {
  const now = options.now ?? (() => Date.now())
  const documentStore = useDocumentStore()
  const persistence = usePersistenceStore()
  const gist = useGistStore()

  /** The document's gist field; follows every change (the store's `version` moves on each). */
  const gistField = computed(() => {
    void documentStore.version
    return toRaw(documentStore.raw).gist()
  })
  /** Published **from this account**: the field's owner is the connected login. */
  const published = computed(() => gistField.value !== null && gist.connected && gistField.value.owner === gist.login)
  const busy = computed(() => gist.publishState !== 'idle')
  const hasBodies = computed(() => documentStore.bodies.length > 0)
  /** **Publish to a gist** can run: connected, something to publish, not already published here. */
  const canPublish = computed(() => gist.connected && hasBodies.value && !published.value && !busy.value)
  /** **Update gist** can run. */
  const canUpdate = computed(() => published.value && hasBodies.value && !busy.value)
  /** The short link, `https://app.warpcad.com/#/gist/<id>`, or `null`. */
  const shortLink = computed(() => (gistField.value === null ? null : gistLink(gistField.value.id)))
  /** **Open on GitHub**: the gist's own page, or `null`. */
  const pageUrl = computed(() => (gistField.value === null ? null : `https://gist.github.com/${gistField.value.id}`))

  /** @param {GistField | null} value */
  function setField(value) {
    toRaw(documentStore.raw).setGist(value, { origin: GIST_ORIGIN })
    documentStore.refresh()
  }

  /** The body names the README lists, in timeline order. */
  const bodyNames = () => documentStore.bodies.map((body) => body.name)

  /** The gist's description: the project's name as one plain line. @param {string} name */
  const descriptionOf = (name) => plainGistDescription(name) || DEFAULT_SHARE_NAME

  /**
   * Back to idle, with the outcome on the store for the sheet.
   *
   * @template {GistPublishOk | GistFailure | { ok: true, alreadyGone: boolean }} T
   * @param {T} outcome
   * @param {{ publishedAt?: number | null }} [extra]
   * @returns {T}
   */
  function done(outcome, extra = {}) {
    gist.setPublishState('idle')
    if (outcome.ok) {
      gist.noteOutcome({
        ok: true,
        ...('warning' in outcome && outcome.warning !== undefined ? { warning: outcome.warning } : {}),
        ...(extra.publishedAt === undefined ? {} : { publishedAt: extra.publishedAt }),
      })
    } else {
      gist.noteOutcome(/** @type {GistFailure} */ (outcome))
    }
    return outcome
  }

  /**
   * **Publish to a gist**: a new gist with the project file and its README, secret unless
   * `public` is exactly `true`.
   *
   * @param {{ public?: boolean, name?: string }} [choice] `name` — the Share sheet's Name, the gist's
   *   title; without it the project's own name is used.
   * @returns {Promise<GistPublishOk | GistFailure>}
   */
  async function publish(choice = {}) {
    if (busy.value) return fail('busy', 'publish')
    // Busy and the project read at the tap, synchronously: a double tap is refused, and what is
    // published is the project as it was when the button was pressed.
    gist.setPublishState('publishing')
    if (!hasBodies.value) return done(fail('no-bodies', 'publish'))
    const loadAt = documentStore.loadRevision
    const text = serializeProject(toRaw(documentStore.raw))
    const name = choice.name ?? persistence.projectName
    const fileName = gistFileName(name)
    const publishedAt = now()
    const readme = { name, note: '', bodies: bodyNames(), publishedAt }
    const isPublic = choice.public === true

    await gist.start()
    const client = gist.authorized()
    if (client === null) return done(fail('not-connected', 'publish'))
    if (published.value) return done(fail('already-published', 'publish'))
    const owner = gist.login

    /** @type {import('../storage/gistBackend.js').GistPublished} */
    let created
    try {
      created = await client.createGist({
        files: { [fileName]: text, [README]: gistReadme({ ...readme, id: null }) },
        description: descriptionOf(name),
        public: isPublic,
      })
    } catch (error) {
      return done(gistFailureOf(error, 'publish'))
    }
    gist.rememberRevision(created.id, created.revision)
    const link = gistLink(created.id)
    if (documentStore.loadRevision !== loadAt) {
      return done({ ok: true, id: created.id, link, revision: created.revision, name, warning: 'project-changed' }, { publishedAt })
    }
    /** @type {GistField} */
    const field = { id: created.id, public: isPublic, lastRevision: created.revision, owner }
    setField(field)

    // The second call: the README with the link, now that there is an id.
    try {
      const rawUrl = gistRawFileUrl(owner, created.id, fileName)
      const patched = await client.updateGist({
        id: created.id,
        files: { [README]: gistReadme({ ...readme, id: created.id, rawUrl, fileName }) },
      })
      gist.rememberRevision(created.id, patched.revision)
      if (documentStore.loadRevision !== loadAt) {
        return done({ ok: true, id: created.id, link, revision: patched.revision, name, warning: 'project-changed' }, { publishedAt })
      }
      setField({ ...field, lastRevision: patched.revision })
      persistence.noteGistSaved(publishedAt)
      return done({ ok: true, id: created.id, link, revision: patched.revision, name }, { publishedAt })
    } catch {
      if (documentStore.loadRevision === loadAt) persistence.noteGistSaved(publishedAt)
      return done({ ok: true, id: created.id, link, revision: created.revision, name, warning: 'readme' }, { publishedAt })
    }
  }

  /**
   * **Update gist**: the same gist, a new revision — refused, writing nothing, when the gist is
   * not at the revision this project last published.
   *
   * @param {{ name?: string }} [choice] `name` — the Share sheet's Name (see {@link publish});
   *   without it (**File ▾ → Save to gist**, `TODO/io-021`) the gist keeps its own title, and only a
   *   gist with none takes the project's name.
   * @returns {Promise<GistPublishOk | GistFailure>}
   */
  async function update(choice = {}) {
    if (busy.value) return fail('busy', 'update')
    gist.setPublishState('updating')
    await gist.start()
    const current = gistField.value
    if (current === null || !published.value) return done(fail('not-published', 'update'))
    const client = gist.authorized()
    if (client === null) return done(fail('not-connected', 'update'))
    if (!hasBodies.value) return done(fail('no-bodies', 'update'))

    /** @type {import('../storage/gistBackend.js').GistRead} */
    let remote
    try {
      remote = await gist.readGist(current.id)
    } catch (error) {
      return done(gistFailureOf(error, 'update'))
    }
    if (remote.revision !== current.lastRevision && !gist.wroteRevision(current.id, remote.revision)) {
      return done(fail('changed-remotely', 'update'))
    }

    const loadAt = documentStore.loadRevision
    const text = serializeProject(toRaw(documentStore.raw))
    const name = choice.name ?? (plainGistDescription(remote.description) || persistence.projectName)
    const fileName = gistFileName(name)
    const publishedAt = now()
    /** @type {Record<string, string | null>} */
    const files = {
      [fileName]: text,
      [README]: gistReadme({
        name,
        note: '',
        bodies: bodyNames(),
        publishedAt,
        id: current.id,
        rawUrl: gistRawFileUrl(current.owner, current.id, fileName),
        fileName,
      }),
    }
    // A renamed project: remove the old file rather than leave two projects in the gist.
    if (remote.fileName !== fileName && remote.fileName !== README) files[remote.fileName] = null

    /** @type {import('../storage/gistBackend.js').GistPublished} */
    let updated
    try {
      updated = await client.updateGist({ id: current.id, files, description: descriptionOf(name) })
    } catch (error) {
      return done(gistFailureOf(error, 'update'))
    }
    gist.rememberRevision(current.id, updated.revision)
    const link = gistLink(current.id)
    if (documentStore.loadRevision !== loadAt) {
      return done({ ok: true, id: current.id, link, revision: updated.revision, name, warning: 'project-changed' }, { publishedAt })
    }
    setField({ ...current, lastRevision: updated.revision })
    persistence.noteGistSaved(publishedAt)
    return done({ ok: true, id: current.id, link, revision: updated.revision, name }, { publishedAt })
  }

  /**
   * **Stop sharing**: delete the gist and clear the field. A gist already gone (404) counts as
   * stopped; any other failure keeps the field, since the gist may still exist.
   *
   * @returns {Promise<{ ok: true, alreadyGone: boolean } | GistFailure>}
   */
  async function stop() {
    if (busy.value) return fail('busy', 'stop')
    gist.setPublishState('stopping')
    const loadAt = documentStore.loadRevision
    await gist.start()
    const current = gistField.value
    if (current === null || !published.value) return done(fail('not-published', 'stop'))
    const client = gist.authorized()
    if (client === null) return done(fail('not-connected', 'stop'))

    let alreadyGone = false
    try {
      await client.deleteGist({ id: current.id })
    } catch (error) {
      const failure = gistFailureOf(error, 'stop')
      if (failure.kind !== 'not-found') return done(failure)
      alreadyGone = true
    }
    if (documentStore.loadRevision === loadAt) setField(null)
    return done({ ok: true, alreadyGone }, { publishedAt: null })
  }

  /**
   * The short link for **Copy gist link**, or `null` when the project is not published.
   *
   * @returns {string | null}
   */
  function link() {
    return shortLink.value
  }

  return { gistField, published, busy, canPublish, canUpdate, shortLink, pageUrl, publish, update, stop, link }
}
