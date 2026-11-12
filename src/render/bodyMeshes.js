// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The 3D view's committed bodies (`TODO/ui-108`, extraction 1): one scene object per document
 * body, kept in step with the document, and painted for selection, the object list's hover,
 * a Repeat session's outlines and the colour scheme.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the stores it reads
 * (selection, Align reference, hover highlight, Repeat session, colour preview) and the frame
 * scheduler are handed in, and the counts the viewport announces as `data-*` attributes are
 * written into a plain object the caller supplies (the viewport passes a `reactive` one). Every
 * mesh, material and twin lives in plain non-reactive variables (CLAUDE.md's Performance rule).
 *
 * Nothing here runs per frame: sync runs at document-change rate, selection and hover at
 * change rate, the theme on a colour-scheme switch.
 */
import { Group as ThreeGroup } from 'three'
import {
  addXrayTwin,
  applyViewVisibility,
  BODY_COLORS,
  bodyObjectIsCurrent,
  createBodyMaterial,
  createBodyObject,
  createColorMaterialCache,
  createHoverPartMesh,
  createXrayMaterial,
  disposeBodyObject,
  disposeMesh,
  paintBodyObject,
  updateBodyObject,
} from './mesh.js'
import { isDrawn } from './pick.js'
import { colorIntToCssHex, ownOverrideOf } from '../core/colorOverride.js'
import { isBodyDrawn, isPartDrawn } from '../core/visibility.js'
import { hiddenNamesOf, isGroup } from '../core/kernel/group.js'

/** @typedef {import('three').Mesh} Mesh */

/**
 * What the viewport announces for specs: `data-xray-twins`, `data-hover-twins`,
 * `data-repeat-outlines` and `data-hover-transient`.
 *
 * @typedef {object} BodyCounts
 * @property {number} xrayTwins Selection twins attached.
 * @property {number} hoverTwins Hover twins attached.
 * @property {number} repeatOutlines Repeat targets outlined.
 * @property {string} hoverTransient The part name of the hovered hidden part's transient mesh, or `''`.
 */

/**
 * A body as `document.bodies()` reports it: what this module reads of one.
 *
 * @typedef {{
 *   id: string,
 *   recordId: string,
 *   geometry: any,
 *   colorOverrides?: readonly import('../core/document.js').ColorOverride[],
 * } & import('../core/visibility.js').BodyView} SyncedBody
 */

/**
 * @typedef {object} BodyMeshesDeps
 * @property {() => Iterable<SyncedBody>} bodies The bodies to draw: the preview's, or the live
 *   document's (the viewport's `renderSource().bodies()`).
 * @property {(id: string) => boolean} isHiddenShown Whether **Show hidden parts** is on for a body
 *   (`TODO/ui-047`).
 * @property {(id: string) => boolean} isSketched Whether the sketch editor is drawing over this
 *   body, so its mesh stays hidden behind the live preview.
 * @property {{ has: (id: string) => boolean, ids: readonly string[] }} selection
 * @property {{ originOnly: boolean }} alignReference
 * @property {{ target: { bodyId: string, partName: string | null } | null, many: readonly string[] | null | undefined }} hoverHighlight
 * @property {{ seed: { bodyId: string } | null | undefined, outlined: readonly string[] }} repeatSession
 * @property {{ bodyId: string | null | undefined, color: number, subPart: string | undefined }} colorPreview
 * @property {() => void} scheduleRender
 * @property {BodyCounts} [counts] Written as twins come and go; a fresh plain object when omitted.
 */

/**
 * The counts' starting values.
 *
 * @returns {BodyCounts}
 */
export function createBodyCounts() {
  return { xrayTwins: 0, hoverTwins: 0, repeatOutlines: 0, hoverTransient: '' }
}

/** The whole-body hover {@link BodyMeshes#paintBodies} hands a body in the hover's many-body set: one shared value. */
const HOVER_WHOLE_BODY = Object.freeze({ partName: null })

/**
 * Build the body controller. The group and map exist from the start; the materials do not
 * until {@link BodyMeshes#createMaterials}, and every operation is a no-op until then, as it
 * was before mount.
 *
 * @param {BodyMeshesDeps} deps
 */
export function createBodyMeshes(deps) {
  const { selection, alignReference, hoverHighlight, repeatSession, colorPreview, scheduleRender } = deps
  const counts = deps.counts ?? createBodyCounts()

  /**
   * Committed bodies, one scene object per document body id.
   *
   * A **bare solid is one `Mesh`; a Group-valued body is a `THREE.Group` of one
   * mesh per named part** (`TODO/ui-016`, `src/render/mesh.js`'s
   * `createBodyObject`). That structure is what a raycast needs in order to
   * resolve a hit to a part rather than only to a body — the old single combined
   * mesh had already unioned the parts away.
   */
  const bodiesGroup = new ThreeGroup()
  bodiesGroup.name = 'bodies'
  /** @type {Map<string, Mesh | ThreeGroup>} */
  const bodyMeshes = new Map()

  let bodyMaterial = /** @type {any} */ (null)
  let selectedMaterial = /** @type {any} */ (null)
  /** The rest of a multi-body selection — everything but the one picked first. */
  let secondaryMaterial = /** @type {any} */ (null)
  /** X-ray tints for a selected body's hidden part (`TODO/ui-041`), base and secondary. */
  let xrayMaterial = /** @type {any} */ (null)
  let xraySecondaryMaterial = /** @type {any} */ (null)
  /**
   * Materials for bodies carrying a user colour override (`TODO/ui-037`), one per
   * colour/alpha/selection role — see `createColorMaterialCache`. A body with no
   * override never touches this and keeps the three shared materials above.
   *
   * @type {import('./mesh.js').ColorMaterialCache | null}
   */
  let colorMaterials = null
  /** The twins currently attached, so a selection change can take them all off again. */
  /** @type {Mesh[]} */
  const xrayTwins = []

  /**
   * The object list's hover highlight (`TODO/ui-049`), kept **apart** from the selection's
   * twins above so a hover change adds and removes only its own meshes and never rebuilds
   * every selection twin: its own x-ray material in the hover colour, the twins it put on the
   * hovered meshes, and the one transient mesh a hovered *hidden* part gets while **Show
   * hidden parts** is off. All plain, non-reactive — the counts are the only announced state.
   */
  let xrayHoverMaterial = /** @type {any} */ (null)
  /** @type {Mesh[]} */
  const hoverTwins = []
  /** @type {Mesh | null} */
  let hoverTransient = null
  /**
   * `TODO/ui-092`: the hover store's many-body set, copied at hover-change rate so
   * {@link paintBodies} looks bodies up without allocating per pass.
   *
   * @type {Set<string>}
   */
  const hoverManySet = new Set()

  /**
   * A Repeat session's target outlines (`TODO/ui-069`): every ticked target other than the seed,
   * in the object list's hover tint (its x-ray material), so the user can see where the repeats
   * will go. Kept apart from the hover's own twins — a hover change must not drop these, and a
   * target is usually a **hidden** part (a Pi's `hole3`), so each gets a transient mesh the way a
   * hovered hidden part does. Plain, non-reactive; the count is the only announced state.
   */
  /** @type {Mesh[]} */
  const repeatTwins = []
  /** @type {Mesh[]} */
  const repeatTransients = []

  /**
   * Create the shared materials in a theme's palette. Called once, on mount.
   *
   * @param {import('./mesh.js').MeshTheme} theme
   * @returns {void}
   */
  function createMaterials(theme) {
    const palette = BODY_COLORS[theme] ?? BODY_COLORS.dark
    bodyMaterial = createBodyMaterial(palette.body)
    selectedMaterial = createBodyMaterial(palette.selected)
    secondaryMaterial = createBodyMaterial(palette.secondary)
    xrayMaterial = createXrayMaterial(palette.selected)
    xraySecondaryMaterial = createXrayMaterial(palette.secondary)
    xrayHoverMaterial = createXrayMaterial(palette.hover)
    colorMaterials = createColorMaterialCache({ selected: palette.selected, secondary: palette.secondary, hover: palette.hover })
  }

  /**
   * Rebuild the scene's meshes from the document's replayed bodies.
   *
   * Additive by construction: a mesh is created only for an id that has none, and
   * removed only for an id the document no longer has. Rebuilding the whole group
   * from scratch would be simpler and is exactly how the second attempt ended up
   * with a second body replacing the first (ACCEPTANCE.md scenario 1).
   *
   * Meshes are keyed by a body's **lineage root** id, which is what makes a move
   * update a body rather than duplicate it: `document.bodies()` reports one entry
   * per logical object however many transform records it has accumulated (see
   * `src/core/document.js`'s supersession note), so a moved body is the same mesh
   * with new geometry — and the selection pointing at it survives, because its id
   * did not change. `recordId` is what actually changed, so that is what decides
   * whether the geometry needs rebuilding.
   *
   * @returns {void}
   */
  function syncBodies() {
    if (!bodyMaterial) return
    // The hover's twins share their meshes' geometry and its transient mesh sits inside a
    // body's container: take them off before any geometry is swapped or disposed, and put
    // them back at the end against whatever the scene now holds.
    removeHoverArtifacts()
    removeRepeatOutlines()
    // Preview bodies carry the *same* lineage-root ids as live ones — they come
    // from the same records — so entering and leaving a preview adds and removes
    // exactly the meshes that differ, through the same additive path a normal
    // edit takes. Nothing about preview needs its own rebuild strategy.
    const bodies = deps.bodies()
    const live = new Set()
    for (const body of bodies) {
      live.add(body.id)
      // Hidden parts to also build a mesh for (`TODO/ui-047`'s **Show hidden parts**
      // toggle) — `[]` whenever the body is not in the shown set, which reproduces
      // today's mesh count exactly. Computed every pass (cheap: a `Set.has` and an
      // array filter, not a kernel call) so a toggle click is picked up the next
      // time this function runs, without its own separate diffing path.
      const shownHiddenNames =
        isGroup(body.geometry) && deps.isHiddenShown(body.id)
          ? hiddenNamesOf(body.geometry)
          : []
      // A stable key for "does the set of hidden-part meshes this body needs match
      // what it already has", so toggling forces a rebuild and leaving it alone
      // never does — joined with a separator no part name can contain.
      const hiddenShownKey = shownHiddenNames.join('\u0000')
      const existing = bodyMeshes.get(body.id)
      if (existing) {
        // Decided before `userData.geometry` is refreshed below (`TODO/ui-052`): same record
        // *and* same evaluated geometry, or the mesh is stale.
        const current = bodyObjectIsCurrent(existing.userData, body, hiddenShownKey)
        // Read by `paintBodies`. Set before the early-out on purpose: a timeline
        // preview can hand back the same terminal with a different history.
        existing.userData.colorOverrides = body.colorOverrides
        // A bare `Geom3` has no `.colors` at all, so this is `undefined` for every
        // non-composite body — exactly the "no recipe colour" case `paintColorOf`
        // already falls through on (`TODO/render-003`).
        existing.userData.recipeColors = isGroup(body.geometry) ? body.geometry.colors : undefined
        // What a hovered hidden part's transient mesh is built from (`TODO/ui-049`). A
        // reference to the evaluated result, never a copy, and never reactive.
        existing.userData.geometry = body.geometry
        // `TODO/ui-089`: the user's Hide / Show, read by the hover, the x-ray twins and the
        // gizmo; applied on every pass (visible flags only, no rebuild), before the early-out,
        // because a hide changes the version without changing the geometry.
        existing.userData.view = body
        const sameHiddenShown = existing.userData.hiddenShownKey === hiddenShownKey
        if (current) {
          applyViewVisibility(existing, body, deps.isSketched(body.id))
          continue
        }
        // The body was transformed: swap in the new geometry and drop whatever
        // preview transform the drag left on the object, since the translation or
        // rotation is now baked into the vertices themselves. `updateBodyObject`
        // refuses when the object's *shape* changed — a bare body that became a
        // group, or a group whose part list differs — and the rebuild below picks
        // that up rather than patching one body's geometry into another's slots.
        // Only attempted when the hidden-shown set is unchanged: `updateBodyObject`
        // knows nothing about hidden-part meshes, so a toggle always falls through
        // to the full rebuild below, which bakes the new set in from the start.
        if (sameHiddenShown && updateBodyObject(existing, body.geometry)) {
          existing.position.set(0, 0, 0)
          existing.quaternion.identity()
          existing.userData.recordId = body.recordId
          applyViewVisibility(existing, body, deps.isSketched(body.id))
          continue
        }
        bodiesGroup.remove(existing)
        disposeBodyObject(existing)
        bodyMeshes.delete(body.id)
      }
      const object = createBodyObject(body.geometry, bodyMaterial, body.id, shownHiddenNames)
      object.userData.recordId = body.recordId
      object.userData.hiddenShownKey = hiddenShownKey
      object.userData.colorOverrides = body.colorOverrides
      object.userData.recipeColors = isGroup(body.geometry) ? body.geometry.colors : undefined
      object.userData.geometry = body.geometry
      object.userData.view = body
      applyViewVisibility(object, body, deps.isSketched(body.id))
      bodyMeshes.set(body.id, object)
      bodiesGroup.add(object)
    }
    for (const [id, object] of bodyMeshes) {
      if (live.has(id)) continue
      bodiesGroup.remove(object)
      disposeBodyObject(object)
      bodyMeshes.delete(id)
    }
    applySelectionMaterial()
    applyHover()
    applyRepeatOutlines()
    scheduleRender()
  }

  /**
   * What role a body plays in the current selection.
   *
   * Three states rather than two, because in a 2+ selection the solid picked
   * **first** is not just "also selected" — it is Subtract's base, and everything
   * picked after it is a subtrahend (`TODO/ui-014`). A user has to be able to see
   * which is which before pressing the button, so the distinction is painted onto
   * the solids themselves rather than only living inside the toolbar.
   *
   * The single source for both the material below and the `data-selection-role`
   * the scene list announces, so the DOM cannot claim an order the render does not
   * show.
   *
   * While the Align popover is aligning the first-picked body to the **World origin** on a
   * 2-selection (`TODO/ui-060`), the second body is not involved at all, so it shows no role
   * colour rather than the teal that would read as "the target".
   *
   * @param {string} id A body's lineage root id.
   * @returns {'base' | 'secondary' | 'none'}
   */
  function selectionRole(id) {
    if (!selection.has(id)) return 'none'
    if (selection.ids[0] === id) return 'base'
    return alignReference.originOnly ? 'none' : 'secondary'
  }

  /**
   * Highlight whatever is selected. Deliberately the whole of this task's
   * selection *response*: the inspector, the dimension lines and the transform
   * gizmo are `ui-011`'s contract, not this one's.
   *
   * @returns {void}
   */
  function applySelectionMaterial() {
    if (!bodyMaterial) return
    // Twins are rebuilt from scratch on every call: cheap (selection-change rate, not
    // frame rate), and it means a body whose geometry was swapped by a move or an edit
    // can never keep a twin pointing at the geometry it just disposed.
    for (const twin of xrayTwins) twin.removeFromParent()
    xrayTwins.length = 0
    for (const [id, object] of bodyMeshes) {
      const role = selectionRole(id)
      // A selected body also gets an x-ray twin, because a body completely inside another
      // is occluded at every pixel and swapping its material alone changes nothing on the
      // canvas. Where it is not hidden the twin draws nothing. See `createXrayMaterial`.
      // `TODO/ui-089`: a body the user hid draws no outline, and nor does a part they hid —
      // there is nothing on screen to outline. The user's switches, not `visible`, so the
      // sketch editor's own body keeps its twins exactly as before.
      const view = object.userData.view ?? {}
      if (role !== 'none' && isBodyDrawn(view)) {
        const tint = role === 'base' ? xrayMaterial : xraySecondaryMaterial
        if (object instanceof ThreeGroup) {
          for (const child of object.children) {
            // A hover's transient hidden part is not part of the selection's picture.
            if (child.userData.hoverTransient) continue
            if (!isPartDrawn(view, child.userData.partName)) continue
            xrayTwins.push(addXrayTwin(/** @type {Mesh} */ (child), tint))
          }
        } else {
          xrayTwins.push(addXrayTwin(/** @type {Mesh} */ (object), tint))
        }
      }
    }
    counts.xrayTwins = xrayTwins.length
    paintBodies()
  }

  // --- the object list's hover highlight (TODO/ui-049) -----------------------

  /**
   * Take the hover's twins and transient mesh off the scene and free the transient.
   *
   * @returns {void}
   */
  function removeHoverArtifacts() {
    for (const twin of hoverTwins) twin.removeFromParent()
    hoverTwins.length = 0
    if (hoverTransient) {
      hoverTransient.removeFromParent()
      disposeMesh(hoverTransient)
      hoverTransient = null
    }
    counts.hoverTwins = 0
    counts.hoverTransient = ''
  }

  /**
   * Show the current hover target, at hover-change rate (the store refuses a repeat write):
   * the hover tint is painted by {@link paintBodies}, and the target also gets x-ray twins in
   * the hover colour, because a tint that only paints front faces changes nothing on the
   * canvas for a body inside a case — exactly the body the list exists for.
   *
   * A hovered **hidden** part that is not already drawn (Show hidden parts off) gets a
   * transient translucent mesh for the length of the hover, built by the same path `ui-047`'s
   * toggle uses and disposed as soon as the hover moves on.
   *
   * @returns {void}
   */
  function applyHover() {
    removeHoverArtifacts()
    hoverManySet.clear()
    for (const id of hoverHighlight.many ?? []) hoverManySet.add(id)
    const target = hoverHighlight.target
    const object = target ? bodyMeshes.get(target.bodyId) : undefined
    if (target && object && xrayHoverMaterial && bodyMaterial) {
      /** @type {Mesh[]} */
      let meshes = []
      if (object instanceof ThreeGroup) {
        const parts = /** @type {Mesh[]} */ (object.children)
        meshes = target.partName === null ? parts : parts.filter((child) => child.userData.partName === target.partName)
        if (target.partName !== null && meshes.length === 0) {
          // `TODO/ui-089`: never for a part, or of a body, the user hid.
          const transient = createHoverPartMesh(object.userData.geometry, target.partName, bodyMaterial, target.bodyId, object.userData.view)
          if (transient) {
            object.add(transient)
            hoverTransient = transient
            counts.hoverTransient = target.partName
            meshes = [transient]
          }
        }
      } else if (target.partName === null) {
        meshes = [/** @type {Mesh} */ (object)]
      }
      // `TODO/ui-089`: hovering the row of something the user hid lights nothing up.
      meshes = meshes.filter(isDrawn)
      // A body that is also in the many-body set gets its whole-body twins below instead.
      if (!hoverManySet.has(target.bodyId)) for (const mesh of meshes) hoverTwins.push(addXrayTwin(mesh, xrayHoverMaterial))
    }
    // `TODO/ui-092`: every part a Prompts view row's request made, each whole, each with its own
    // twin so a part inside another still shows. Hidden ones light nothing (`TODO/ui-089`).
    if (xrayHoverMaterial) {
      for (const bodyId of hoverManySet) {
        const object = bodyMeshes.get(bodyId)
        if (!object) continue
        const meshes = object instanceof ThreeGroup ? /** @type {Mesh[]} */ (object.children) : [/** @type {Mesh} */ (object)]
        for (const mesh of meshes) if (isDrawn(mesh) && !mesh.userData.hoverTransient) hoverTwins.push(addXrayTwin(mesh, xrayHoverMaterial))
      }
    }
    counts.hoverTwins = hoverTwins.length
    paintBodies()
  }

  /**
   * Take the Repeat session's outline twins and transient meshes off the scene.
   *
   * @returns {void}
   */
  function removeRepeatOutlines() {
    for (const twin of repeatTwins) twin.removeFromParent()
    repeatTwins.length = 0
    for (const transient of repeatTransients) {
      transient.removeFromParent()
      disposeMesh(transient)
    }
    repeatTransients.length = 0
    counts.repeatOutlines = 0
  }

  /**
   * Outline the Repeat session's other ticked targets (`TODO/ui-069`), at session-change rate:
   * arming, ticking a target, the seed body's mesh being rebuilt. A drawn part gets an x-ray twin;
   * a hidden one a transient translucent mesh plus its twin, exactly as a hovered hidden part does.
   *
   * @returns {void}
   */
  function applyRepeatOutlines() {
    removeRepeatOutlines()
    const bodyId = repeatSession.seed?.bodyId
    const object = bodyId === undefined ? undefined : bodyMeshes.get(bodyId)
    if (!(object instanceof ThreeGroup) || !xrayHoverMaterial || !bodyMaterial) {
      scheduleRender()
      return
    }
    for (const partName of repeatSession.outlined) {
      let meshes = /** @type {Mesh[]} */ (object.children).filter((child) => child.userData.partName === partName)
      if (meshes.length === 0) {
        const transient = createHoverPartMesh(object.userData.geometry, partName, bodyMaterial, /** @type {string} */ (bodyId), object.userData.view)
        if (!transient) continue
        object.add(transient)
        repeatTransients.push(transient)
        meshes = [transient]
      }
      for (const mesh of meshes) repeatTwins.push(addXrayTwin(mesh, xrayHoverMaterial))
      counts.repeatOutlines += 1
    }
    scheduleRender()
  }

  /**
   * Put the right material on every body: its selection role, its recipe's own
   * baked-in part colours (`TODO/render-003`) and its user colour overrides
   * (`TODO/ui-037`). Split out of {@link applySelectionMaterial} so a live
   * colour-picker preview can repaint **without** rebuilding the x-ray twins — the
   * picker fires `input` at pointer rate, and twins are a `new Mesh` apiece.
   *
   * A Group-valued body is a container of part meshes (`TODO/ui-016`), so the
   * highlight is painted onto every part: a group selects and highlights as one
   * object, exactly as it did when it was a single combined mesh. The drilled-into
   * part is deliberately *not* highlighted differently — its feedback is the
   * breadcrumb, the dimension lines and the absent gizmo. A colour override, by
   * contrast, *can* differ per part: see `paintBodyObject`.
   *
   * @returns {void}
   */
  function paintBodies() {
    if (!bodyMaterial || !colorMaterials) return
    const shared = { body: bodyMaterial, selected: selectedMaterial, secondary: secondaryMaterial }
    const previewId = colorPreview.bodyId
    const hoverTarget = hoverHighlight.target
    colorMaterials.beginPass()
    for (const [id, object] of bodyMeshes) {
      paintBodyObject(object, {
        role: selectionRole(id),
        overrides: object.userData.colorOverrides,
        preview: previewId === id ? { color: colorPreview.color, subPart: colorPreview.subPart } : null,
        shared,
        cache: colorMaterials,
        recipeColors: object.userData.recipeColors,
        hover: hoverManySet.has(id) ? HOVER_WHOLE_BODY : hoverTarget?.bodyId === id ? { partName: hoverTarget.partName } : null,
      })
    }
    colorMaterials.endPass()
    scheduleRender()
  }

  /**
   * Recolour the body, selection, x-ray and hover materials for a colour scheme. The
   * placement ghost and the sketch preview have materials of their own, which the viewport
   * recolours alongside this.
   *
   * @param {import('./mesh.js').MeshTheme} theme
   * @returns {void}
   */
  function applyMaterialTheme(theme) {
    const palette = BODY_COLORS[theme] ?? BODY_COLORS.dark
    bodyMaterial?.color.setHex(palette.body)
    selectedMaterial?.color.setHex(palette.selected)
    secondaryMaterial?.color.setHex(palette.secondary)
    xrayMaterial?.color.setHex(palette.selected)
    xraySecondaryMaterial?.color.setHex(palette.secondary)
    xrayHoverMaterial?.color.setHex(palette.hover)
    colorMaterials?.setHighlights({ selected: palette.selected, secondary: palette.secondary, hover: palette.hover })
    // A hovered body with no colour of its own wears a copy of the palette colour, keyed by
    // that colour: a scheme switch needs a repaint to pick up the new one.
    if (hoverHighlight.target || hoverHighlight.many) paintBodies()
  }

  /**
   * Free every body object and material, on unmount. Later calls are no-ops, as before mount.
   *
   * @returns {void}
   */
  function dispose() {
    removeHoverArtifacts()
    removeRepeatOutlines()
    for (const object of bodyMeshes.values()) disposeBodyObject(object)
    bodyMeshes.clear()
    bodiesGroup.clear()
    bodyMaterial?.dispose()
    selectedMaterial?.dispose()
    secondaryMaterial?.dispose()
    xrayMaterial?.dispose()
    xraySecondaryMaterial?.dispose()
    xrayHoverMaterial?.dispose()
    xrayHoverMaterial = null
    colorMaterials?.dispose()
    colorMaterials = null
    xrayTwins.length = 0
    bodyMaterial = null
    selectedMaterial = null
    secondaryMaterial = null
    xrayMaterial = null
    xraySecondaryMaterial = null
  }

  return {
    /** The scene group every body object is added to; the viewport adds it to the scene. */
    group: bodiesGroup,
    /** Body objects by lineage-root id. Read-only for callers: picking, the gizmo drag preview. */
    meshes: bodyMeshes,
    counts,
    createMaterials,
    syncBodies,
    selectionRole,
    applySelectionMaterial,
    removeHoverArtifacts,
    applyHover,
    removeRepeatOutlines,
    applyRepeatOutlines,
    paintBodies,
    applyMaterialTheme,
    dispose,
  }
}

/** @typedef {ReturnType<typeof createBodyMeshes>} BodyMeshes */

/**
 * What the scene list announces as a body's colour (`TODO/ui-037`): the
 * whole-body override as `#rrggbb`, or `''` for the theme default. Part overrides
 * are listed separately in `data-body-part-colors`.
 *
 * @param {{ colorOverrides?: readonly import('../core/document.js').ColorOverride[] }} body
 * @returns {string}
 */
export function announcedColor(body) {
  const own = ownOverrideOf(body.colorOverrides, undefined)
  return own ? colorIntToCssHex(own.color) : ''
}

/**
 * `part=#rrggbb;part=#rrggbb`, for the parts that carry their own override.
 *
 * @param {{ colorOverrides?: readonly import('../core/document.js').ColorOverride[] }} body
 * @returns {string}
 */
export function announcedPartColors(body) {
  return (body.colorOverrides ?? [])
    .filter((entry) => entry.subPart !== undefined)
    .map((entry) => `${entry.subPart}=${colorIntToCssHex(entry.color)}`)
    .join(';')
}
