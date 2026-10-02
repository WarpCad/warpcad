// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The mesh bridge: `@jscad/modeling` geometry → a three.js `BufferGeometry`.
 *
 * This is the only place kernel geometry becomes render geometry. Two rules from
 * CLAUDE.md shape it:
 *
 * - **Geometry is derived and disposable.** Nothing here is ever persisted; a
 *   mesh is rebuilt from the document's replayed scene, never stored as document
 *   state.
 * - **Decoded meshes are plain, non-reactive values.** The typed arrays below
 *   must never be handed to Vue's `reactive`/`ref` — deep reactivity walking a
 *   multi-megabyte `Float32Array` is a performance bug, not a convenience.
 *
 * Kernel polygons are convex but may have more than three vertices, so each is
 * fanned into triangles. Vertex normals are computed by three.js from the
 * triangles rather than trusted from the kernel, because a boolean's output
 * carries no per-vertex normals at all.
 *
 * Runs in plain Node under Vitest: `BufferGeometry` needs no GPU context, so the
 * conversion is unit-tested without WebGL (CLAUDE.md: "always mock at the
 * boundary").
 */

import {
  BufferAttribute,
  BufferGeometry,
  GreaterDepth,
  Group as ThreeGroup,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three'

import { paintColorOf, recipeColorOf } from '../core/colorOverride.js'
import { hasNamedParts, toGeom3 } from '../core/kernel/group.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../core/kernel/group.js').Group} KernelGroup */

/**
 * Number of triangles a fan over an `n`-gon produces.
 *
 * @param {number} vertexCount
 * @returns {number}
 */
function trianglesInFan(vertexCount) {
  return vertexCount < 3 ? 0 : vertexCount - 2
}

/**
 * Smallest triangle area the fan below will accept as real, in mm². Anything under it
 * is a sliver whose face normal is numerical noise, so it is treated as zero-area.
 *
 * Deliberately far above the `1e-12` the specs assert with: the specs judge float32
 * coordinates read back out of a file, and a triangle that is only marginally non-zero
 * in the kernel's doubles can round to exactly zero on the way there. The margin costs
 * nothing — it only moves a handful of polygons onto the centroid fan below.
 */
const MIN_TRIANGLE_AREA = 1e-9

/**
 * Convert kernel geometry into a three.js `BufferGeometry` in millimetres, Z-up —
 * the same space the document uses, so no unit conversion happens here and the
 * scene's world units are document millimetres throughout.
 *
 * @param {Geom3} geometry Kernel solid.
 * @param {{ triangulation?: 'fan' | 'non-degenerate' }} [options]
 *   `'fan'` (the default, and what the viewport uses) fans every polygon from its
 *   corner 0 — the cheapest correct triangulation of a convex polygon, and the one
 *   every measurement and snapshot in this project was taken against.
 *
 *   `'non-degenerate'` is the **export** path's mode (`TODO/io-005`), and exists for
 *   one specific reason. `src/core/kernel/watertight.js` closes a solid by inserting a
 *   vertex into the middle of an edge, and those inserted vertices are *collinear with
 *   the edge they split*. Fanning such a polygon from corner 0 puts three collinear
 *   points in a triangle whenever the apex is on a subdivided edge — a zero-area
 *   triangle, which draws as nothing and whose face normal is a normalized
 *   `(0, 0, 0)`. Measured on a repaired `raspberrypi.bplus`: **101 of 672 triangles**.
 *   This mode picks a corner the fan is clean from, and falls back to a centroid fan
 *   for the few polygons where no corner is (measured: 5 of 217 polygons on that same
 *   board). Both keep the surface closed; see the module comment in
 *   `src/render/export.js`.
 * @returns {BufferGeometry} Non-indexed, with computed vertex normals.
 */
export function geom3ToBufferGeometry(geometry, options) {
  const polygons = geometry?.polygons ?? []
  if (options?.triangulation === 'non-degenerate') return nonDegenerateFan(polygons)

  let triangles = 0
  for (const polygon of polygons) triangles += trianglesInFan(polygon.vertices.length)

  const positions = new Float32Array(triangles * 9)
  let offset = 0
  for (const polygon of polygons) {
    const vertices = polygon.vertices
    for (let index = 2; index < vertices.length; index += 1) {
      const a = vertices[0]
      const b = vertices[index - 1]
      const c = vertices[index]
      positions[offset] = a[0]
      positions[offset + 1] = a[1]
      positions[offset + 2] = a[2]
      positions[offset + 3] = b[0]
      positions[offset + 4] = b[1]
      positions[offset + 5] = b[2]
      positions[offset + 6] = c[0]
      positions[offset + 7] = c[1]
      positions[offset + 8] = c[2]
      offset += 9
    }
  }

  const buffer = new BufferGeometry()
  buffer.setAttribute('position', new BufferAttribute(positions, 3))
  buffer.computeVertexNormals()
  return buffer
}

/**
 * Twice the area of a triangle — `|(b - a) × (c - a)|`.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @param {number[]} c
 * @returns {number}
 */
function doubledArea(a, b, c) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
}

/**
 * The first corner a fan over this polygon produces no sliver from, or `-1` when there
 * is none and the caller should use a centroid fan instead.
 *
 * Any corner is a valid apex for a convex polygon, which is what the kernel emits, so
 * this only ever trades one correct triangulation for another correct one.
 *
 * @param {number[][]} vertices
 * @returns {number}
 */
function cleanApex(vertices) {
  const count = vertices.length
  for (let apex = 0; apex < count; apex += 1) {
    let clean = true
    for (let step = 2; step < count && clean; step += 1) {
      const area = doubledArea(vertices[apex], vertices[(apex + step - 1) % count], vertices[(apex + step) % count])
      if (!(area / 2 > MIN_TRIANGLE_AREA)) clean = false
    }
    if (clean) return apex
  }
  return -1
}

/**
 * The export path's triangulation: like the fan above, but never emitting a zero-area
 * triangle — see {@link geom3ToBufferGeometry}'s `options.triangulation`.
 *
 * The centroid of a convex polygon is strictly interior to it, so the fallback fan can
 * produce no sliver either; it costs one extra triangle per polygon (`n` rather than
 * `n - 2`) and is used only where a corner fan genuinely cannot work.
 *
 * @param {{ vertices: number[][] }[]} polygons
 * @returns {BufferGeometry} Non-indexed, with computed vertex normals.
 */
function nonDegenerateFan(polygons) {
  /** @type {number[]} Chosen apex per polygon, or -1 for a centroid fan. */
  const apexes = []
  let triangles = 0
  for (const polygon of polygons) {
    const count = polygon.vertices.length
    if (count < 3) {
      apexes.push(0)
      continue
    }
    const apex = cleanApex(polygon.vertices)
    apexes.push(apex)
    triangles += apex < 0 ? count : trianglesInFan(count)
  }

  const positions = new Float32Array(triangles * 9)
  let offset = 0
  /**
   * @param {number[]} a
   * @param {number[]} b
   * @param {number[]} c
   */
  const write = (a, b, c) => {
    positions[offset] = a[0]
    positions[offset + 1] = a[1]
    positions[offset + 2] = a[2]
    positions[offset + 3] = b[0]
    positions[offset + 4] = b[1]
    positions[offset + 5] = b[2]
    positions[offset + 6] = c[0]
    positions[offset + 7] = c[1]
    positions[offset + 8] = c[2]
    offset += 9
  }

  for (let index = 0; index < polygons.length; index += 1) {
    const vertices = polygons[index].vertices
    const count = vertices.length
    if (count < 3) continue
    const apex = apexes[index]
    if (apex < 0) {
      const centroid = [0, 0, 0]
      for (const vertex of vertices) {
        centroid[0] += vertex[0] / count
        centroid[1] += vertex[1] / count
        centroid[2] += vertex[2] / count
      }
      for (let corner = 0; corner < count; corner += 1) write(centroid, vertices[corner], vertices[(corner + 1) % count])
      continue
    }
    for (let step = 2; step < count; step += 1) {
      write(vertices[apex], vertices[(apex + step - 1) % count], vertices[(apex + step) % count])
    }
  }

  const buffer = new BufferGeometry()
  buffer.setAttribute('position', new BufferAttribute(positions, 3))
  buffer.computeVertexNormals()
  return buffer
}

/**
 * Body colours, per colour scheme. Deliberately not near-black in either scheme:
 * SECOND-ATTEMPT.md lists "the scene is very dark" as a bug that shipped twice,
 * and a body has to read as a solid object against the grid at a glance.
 *
 * `secondary` is the **rest** of a multi-body selection, where `selected` is the
 * one picked first (`TODO/ui-014`). That distinction is not decoration: the
 * first-picked solid is Subtract's base and every later one is a subtrahend, so
 * "which of these is the thing being cut?" has to be answerable by looking at the
 * scene, before the button is pressed. Teal rather than a dimmer amber, for the
 * same reason `--snap-guide` is magenta: the gizmo's rings and the Z dimension
 * line are already accent-blue, and a second highlight in a hue something else
 * owns reads as part of that overlay rather than as its own signal.
 *
 * `hover` is the Inspector object list's hover highlight (`TODO/ui-049`) — a **third**
 * highlight, never either selection colour, so hovering a row whose body is already
 * selected still reads as something different happening. Violet, because every other hue
 * nearby is taken: amber and teal are the selection, blue the gizmo and `--accent`,
 * magenta the snap guides, sky blue a sketch line. Kept in step with `--hover-highlight`
 * in `src/styles/tokens.css`, which marks the hovered row in the list with the same colour
 * so the row and the geometry read as one thing.
 */
export const BODY_COLORS = Object.freeze({
  dark: Object.freeze({
    body: 0x9fc0e8,
    selected: 0xffc46b,
    secondary: 0x66d9c0,
    ghost: 0xffc46b,
    hover: 0xb69cff,
  }),
  light: Object.freeze({
    body: 0x6f8fb8,
    selected: 0xd4802a,
    secondary: 0x0f8a72,
    ghost: 0xd4802a,
    hover: 0x6d3fd6,
  }),
})

/** @typedef {keyof typeof BODY_COLORS} MeshTheme */

/**
 * Material for a committed solid.
 *
 * @param {number} color
 * @returns {MeshStandardMaterial}
 */
export function createBodyMaterial(color) {
  return new MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.55, flatShading: false })
}

/**
 * How strongly a **recoloured** body glows in its selection colour (`TODO/ui-037`).
 *
 * A body without an override shows selection by swapping to the amber/teal
 * palette material, and that stays exactly as it was. A recoloured body cannot:
 * painting it amber while selected would hide the very colour the user is picking
 * — and the Inspector's Color control is only reachable *while* the body is
 * selected, so the pick would never be visible until after a deselect. Instead it
 * keeps its own colour and adds the selection colour as emissive light: red reads
 * as a brighter, warmer red, which is still unmistakably "the red one, selected".
 * Strong enough to read against the unselected copy of the same colour, weak
 * enough not to wash the hue out. Judged on screen in `ui-037`'s Step 6 drive:
 * 0.35 turned a picked pure red visibly orange (measured 217/78/24 against the
 * unselected 182/4/4) — a user who just chose red would reasonably read that as
 * the wrong colour — so it was lowered to 0.2. Selection is still unambiguous:
 * the gizmo, its rings and the dimension lines all attach to the body too.
 */
export const OVERRIDE_HIGHLIGHT_INTENSITY = 0.2

/**
 * Alpha a shown hidden part draws at (`TODO/ui-047`), regardless of the recipe's
 * own baked-in alpha — a bolt's `tap` and a washer's `clearance` both carry alpha
 * `1` (they were opaque before `render-004` hid them), and drawing them at full
 * opacity again would recreate exactly the "looks like a plain red cylinder"
 * problem `render-004` fixed by hiding them, just gated behind a toggle instead of
 * removed outright. `render-003`'s own translucent parts (a Pi board's `mb`) picked
 * their alpha per recipe; this one is fixed, because the point here is "show me
 * where the clearance is", not "render this part's true material".
 */
export const HIDDEN_PART_ALPHA = 0.35

/**
 * How strongly a hovered body (or part) glows in the hover colour (`TODO/ui-049`).
 *
 * Emissive, on top of whatever the body already shows — its palette or override colour
 * and, for a recoloured selected body, its selection glow — which is the precedence the
 * task asks for: selection role and colour first, hover on top. Stronger than
 * {@link OVERRIDE_HIGHLIGHT_INTENSITY} on purpose: a hover is a transient "this one", and it
 * has to read against a body that is already lit up as selected.
 */
export const HOVER_HIGHLIGHT_INTENSITY = 0.45

/** @typedef {'none' | 'base' | 'secondary'} SelectionRole */

/**
 * @typedef {object} ColorMaterialCache
 * @property {() => void} beginPass Start a repaint: nothing is marked in use yet.
 * @property {() => void} endPass End a repaint: dispose every cached material the
 *   pass did not ask for — the only place an override material is ever freed, so a
 *   body that is deleted, reset, or recoloured releases its old material here.
 * @property {(color: number, colorAlpha: number | undefined, role: SelectionRole, hovered?: boolean) => MeshStandardMaterial} materialFor
 *   The one material for this colour/alpha/role/hover, created on first use.
 * @property {(color: number, role: SelectionRole) => MeshStandardMaterial} previewMaterial
 *   The live picker preview's material, **reused and repainted in place** — a picker
 *   fires `input` at pointer rate, and one material per colour it passes through
 *   would allocate and dispose on every event.
 * @property {(highlights: { selected: number, secondary: number, hover?: number }) => void} setHighlights
 *   Retint every highlight (a colour-scheme switch). `hover` left out keeps the current one.
 * @property {() => void} dispose Release everything.
 * @property {number} size How many override materials are cached (not counting
 *   the preview ones) — for tests and for the curious.
 */

/**
 * Sum `[colour, intensity]` light contributions per channel, clamped to white — what
 * several emissive glows on one surface add up to.
 *
 * @param {ReadonlyArray<[number, number]>} terms
 * @returns {number} `0xrrggbb`.
 */
function summedLight(terms) {
  let red = 0
  let green = 0
  let blue = 0
  for (const [color, intensity] of terms) {
    red += ((color >> 16) & 0xff) * intensity
    green += ((color >> 8) & 0xff) * intensity
    blue += (color & 0xff) * intensity
  }
  const clamp = (/** @type {number} */ value) => Math.min(255, Math.round(value))
  return (clamp(red) << 16) | (clamp(green) << 8) | clamp(blue)
}

/**
 * Per-colour materials for bodies carrying a user colour override (`TODO/ui-037`).
 *
 * ## Why keyed by colour rather than by body
 *
 * The TODO proposed one material per body. Keying by `colour × alpha × selection
 * role` is that, minus the duplicates: every body the user painted the same red
 * shares one material, and a body with no override allocates nothing at all — it
 * keeps using the viewport's three shared palette materials, unchanged. Nothing
 * here is created per frame: a material is made the first time a colour is
 * painted (a commit, a selection change) and freed by {@link ColorMaterialCache.endPass}
 * once no body uses it.
 *
 * ## Hover (`TODO/ui-049`)
 *
 * A hovered part needs a material of its own even when it has no colour override — tinting
 * the viewport's shared palette material would light up every body that shares it. So the
 * hover is one more key component: `colour × alpha × role × hovered`, created when a row is
 * first hovered and freed by the first pass after the pointer leaves it.
 *
 * @param {{ selected: number, secondary: number, hover?: number }} highlights Highlight
 *   colours of the current theme. `hover` defaults to the dark scheme's.
 * @returns {ColorMaterialCache}
 */
export function createColorMaterialCache(highlights) {
  /** @type {Map<string, { material: MeshStandardMaterial, role: SelectionRole, hovered: boolean }>} */
  const materials = new Map()
  /** @type {Set<string>} */
  const used = new Set()
  /** @type {Map<SelectionRole, MeshStandardMaterial>} */
  const previews = new Map()
  let selected = highlights.selected
  let secondary = highlights.secondary
  let hover = highlights.hover ?? BODY_COLORS.dark.hover

  /**
   * @param {MeshStandardMaterial} material
   * @param {SelectionRole} role
   * @param {boolean} [hovered]
   */
  function tint(material, role, hovered = false) {
    if (!hovered) {
      if (role === 'none') {
        material.emissive.setHex(0x000000)
        material.emissiveIntensity = 1
        return
      }
      material.emissive.setHex(role === 'base' ? selected : secondary)
      material.emissiveIntensity = OVERRIDE_HIGHLIGHT_INTENSITY
      return
    }
    // Hovered: both glows at once, summed per channel — emissive is additive light, so the
    // selection's contribution survives underneath the hover's rather than being replaced.
    /** @type {Array<[number, number]>} */
    const terms = [[hover, HOVER_HIGHLIGHT_INTENSITY]]
    if (role !== 'none') terms.push([role === 'base' ? selected : secondary, OVERRIDE_HIGHLIGHT_INTENSITY])
    material.emissive.setHex(summedLight(terms))
    material.emissiveIntensity = 1
  }

  return {
    beginPass() {
      used.clear()
    },

    endPass() {
      for (const [key, entry] of materials) {
        if (used.has(key)) continue
        // A colour's plain and hovered materials live and die as a pair (`TODO/ui-049`):
        // disposing the plain one while its hovered copy is on screen can take the last
        // user of a shader program with it (a translucent part's, say). Measured by
        // `bench/hover-sweep.mjs`: ~90 ms frames on every hover enter and leave of a Pi's
        // alpha-0.75 board, gone once the pair is kept — consistent with three.js deleting
        // and recompiling that program each time (inferred, not CPU-profiled).
        const base = key.endsWith(':hover') ? key.slice(0, -':hover'.length) : key
        if (used.has(base) || used.has(`${base}:hover`)) continue
        entry.material.dispose()
        materials.delete(key)
      }
    },

    materialFor(color, colorAlpha, role, hovered = false) {
      const alpha = colorAlpha ?? 1
      const key = `${color}:${alpha}:${role}${hovered ? ':hover' : ''}`
      used.add(key)
      const existing = materials.get(key)
      if (existing) return existing.material
      const material = createBodyMaterial(color)
      if (alpha < 1) {
        material.transparent = true
        material.opacity = alpha
        // Same reasoning as `createGhostMaterial`: a translucent body material
        // that writes depth can incorrectly occlude or clip whatever draws after
        // it in the transparent pass — another translucent part, or an opaque
        // one whose fragments still have to blend underneath this one rather
        // than being depth-tested against it (`TODO/render-003`, the Pi boards'
        // alpha-0.75 `mb`/`board` parts). An opaque body keeps the default
        // `depthWrite: true`, unchanged.
        material.depthWrite = false
      }
      tint(material, role, hovered)
      materials.set(key, { material, role, hovered })
      return material
    },

    previewMaterial(color, role) {
      let material = previews.get(role)
      if (!material) {
        material = createBodyMaterial(color)
        previews.set(role, material)
      }
      material.color.setHex(color)
      tint(material, role)
      return material
    },

    setHighlights(next) {
      selected = next.selected
      secondary = next.secondary
      if (next.hover !== undefined) hover = next.hover
      for (const { material, role, hovered } of materials.values()) tint(material, role, hovered)
      for (const [role, material] of previews) tint(material, role)
    },

    dispose() {
      for (const { material } of materials.values()) material.dispose()
      for (const material of previews.values()) material.dispose()
      materials.clear()
      previews.clear()
      used.clear()
    },

    get size() {
      return materials.size
    },
  }
}

/**
 * Paint one body object — a bare mesh, or {@link createBodyObject}'s container of
 * part meshes — for its selection role, its recipe's own baked-in colours
 * (`TODO/core-026`'s `Group.colors`, rendered starting `TODO/render-003`) and its
 * user colour overrides (`TODO/ui-037`).
 *
 * Per part, in order:
 *
 * 1. a live **preview** for this part (the picker is open) — its whole-body form
 *    does not paint over a part that has its own *user* override, because
 *    committing it would not either (`src/core/colorOverride.js`'s precedence
 *    rule) — a part with only a *recipe* colour and no user override is not
 *    exempted, since a whole-body user pick does beat a recipe colour once
 *    committed, so the preview has to show that too;
 * 2. the part's **paint colour** — {@link paintColorOf}'s four-tier precedence:
 *    a user sub-part override, else a user whole-body override, else the
 *    recipe's own colour for this part, in that order;
 * 3. otherwise the **shared palette material** for the role, the very instance the
 *    viewport has always used, so a body with neither a recipe colour nor a user
 *    override draws exactly as before.
 *
 * @param {Mesh | ThreeGroup} object
 * @param {{
 *   role: SelectionRole,
 *   overrides: readonly import('../core/document.js').ColorOverride[] | undefined,
 *   preview: { color: number, subPart?: string } | null,
 *   shared: { body: MeshStandardMaterial, selected: MeshStandardMaterial, secondary: MeshStandardMaterial },
 *   cache: ColorMaterialCache,
 *   recipeColors?: Readonly<Record<string, import('../core/kernel/group.js').PartColor>>,
 *   hover?: { partName: string | null } | null,
 * }} options `hover` is set when this body is the object list's hover target
 *   (`TODO/ui-049`): `partName: null` tints every part, a name tints only that part. It is
 *   applied **last**, on top of role and colour, as emissive — a live colour-picker preview
 *   is the one thing it does not tint, since the picker is open and the user is looking at
 *   the colour itself.
 * @returns {void}
 */
export function paintBodyObject(object, { role, overrides, preview, shared, cache, recipeColors, hover = null }) {
  const palette = role === 'base' ? shared.selected : role === 'secondary' ? shared.secondary : shared.body

  /**
   * @param {string | undefined} partName
   * @returns {boolean}
   */
  const isHovered = (partName) => hover !== null && (hover.partName === null || hover.partName === partName)

  /**
   * @param {string | undefined} partName
   * @returns {MeshStandardMaterial}
   */
  const materialForPart = (partName) => {
    if (preview) {
      const previewsThisPart =
        preview.subPart === undefined || preview.subPart === ''
          ? // A whole-body pick: every part except one with a colour of its own.
            !(partName !== undefined && overrides?.some((entry) => entry.subPart === partName))
          : preview.subPart === partName
      if (previewsThisPart) return cache.previewMaterial(preview.color, role)
    }
    const paint = paintColorOf(overrides, recipeColors, partName)
    const hovered = isHovered(partName)
    if (paint) return cache.materialFor(paint.color, paint.colorAlpha, role, hovered)
    // The palette colour already *is* the selection colour, so the hovered copy of it
    // carries no second selection glow — just the hover on top.
    return hovered ? cache.materialFor(palette.color.getHex(), undefined, 'none', true) : palette
  }

  /**
   * A shown hidden part (`TODO/ui-047`) always draws in its own recipe colour at a
   * fixed translucent alpha, never the shared palette and never a preview — the
   * colour picker only ever targets a *visible* part or the whole body, so there is
   * nothing for a hidden part's own preview branch to check.
   *
   * @param {string | undefined} partName
   * @returns {MeshStandardMaterial}
   */
  const hiddenPartMaterial = (partName) => {
    const paint = recipeColorOf(recipeColors, partName)
    const color = paint?.color ?? palette.color.getHex()
    return cache.materialFor(color, HIDDEN_PART_ALPHA, 'none', isHovered(partName))
  }

  if (object instanceof ThreeGroup) {
    for (const child of object.children) {
      const mesh = /** @type {Mesh} */ (child)
      mesh.material = mesh.userData.hiddenPart
        ? hiddenPartMaterial(mesh.userData.partName)
        : materialForPart(mesh.userData.partName)
    }
    return
  }
  /** @type {Mesh} */ (object).material = materialForPart(undefined)
}

/**
 * Material for the drag-placement ghost — translucent, and drawn without writing
 * depth so it never punches a hole in the solids behind it.
 *
 * @param {number} color
 * @returns {MeshStandardMaterial}
 */
export function createGhostMaterial(color) {
  return new MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    metalness: 0,
    roughness: 0.9,
  })
}

/**
 * Material for a selected body's **x-ray twin** (`TODO/ui-041`).
 *
 * A selection is painted by swapping a body's material, which is invisible when the
 * body is completely inside another: the enclosing shell wins the depth test at every
 * pixel, so "the bolt is now selected" changed no pixel on the canvas (measured: 0
 * changed pixels). The twin is the same geometry drawn again with the depth test
 * inverted — `GreaterDepth` passes only where something nearer is already in the depth
 * buffer — so it shows **only the part of the selected body that is hidden**, as a
 * translucent tint in its selection colour. Where the body is not occluded it draws
 * nothing at all, so an ordinary selection looks exactly as it did.
 *
 * Front faces only, which is what stops a lone selected body's own far side from
 * tinting through its near side; the polygon offset pulls the twin *nearer*, so its
 * own coincident front face can never pass a strict `Greater` against itself.
 *
 * @param {number} color
 * @returns {MeshBasicMaterial}
 */
export function createXrayMaterial(color) {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    depthFunc: GreaterDepth,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
}

/**
 * Give a body mesh an x-ray twin (see {@link createXrayMaterial}) as a child, so it
 * follows every transform the mesh gets — including a gizmo drag's live preview.
 * Shares the mesh's geometry rather than copying it, and is excluded from picking:
 * a twin that answered the raycast would make the selected body claim clicks aimed at
 * the shell in front of it.
 *
 * @param {Mesh} mesh
 * @param {MeshBasicMaterial} material
 * @returns {Mesh} The twin, so the caller can remove it again.
 */
export function addXrayTwin(mesh, material) {
  const twin = new Mesh(mesh.geometry, material)
  twin.renderOrder = 2
  twin.raycast = () => {}
  twin.name = 'xray-twin'
  mesh.add(twin)
  return twin
}

/**
 * Build the **transient** mesh for one hidden part (`TODO/ui-049`): hovering a hidden part
 * row (a bolt's `tap`) while **Show hidden parts** is off would otherwise change nothing on
 * the canvas, and hidden parts are exactly the rows a user needs to *see* before using one
 * as a Subtract operand.
 *
 * The same geometry path `ui-047`'s toggle builds (see {@link createBodyObject}'s
 * `shownHiddenNames`), and flagged `hiddenPart` so {@link paintBodyObject} paints it the same
 * translucent way when the caller adds it to the body's container. It is additionally flagged
 * `hoverTransient` and **never pickable** — it exists for the length of a hover, and a ray
 * through it must reach whatever is really there. The caller owns it: remove it and
 * {@link disposeMesh} it when the hover ends.
 *
 * @param {Geom3 | KernelGroup} geometry The body's geometry.
 * @param {string} partName
 * @param {MeshStandardMaterial} material Initial material; repainted by the caller.
 * @param {string} bodyId
 * @returns {Mesh | null} `null` unless `partName` is a hidden part of a group that is drawn
 *   part by part — a visible part already has a mesh, and a bare solid has no parts.
 */
export function createHoverPartMesh(geometry, partName, material, bodyId) {
  if (!hasNamedParts(geometry)) return null
  const part = geometry.parts[partName]
  if (!part || geometry.names.includes(partName)) return null
  const mesh = new Mesh(geom3ToBufferGeometry(part), material)
  mesh.name = bodyId
  mesh.userData.bodyId = bodyId
  mesh.userData.partName = partName
  mesh.userData.hiddenPart = true
  mesh.userData.hoverTransient = true
  mesh.raycast = () => {}
  return mesh
}

/**
 * Build a renderable mesh for a solid.
 *
 * @param {Geom3} geometry
 * @param {MeshStandardMaterial} material
 * @returns {Mesh}
 */
export function createMesh(geometry, material) {
  return new Mesh(geom3ToBufferGeometry(geometry), material)
}

/**
 * Build the scene object for one document body — a plain `Mesh` for a bare
 * solid, or a `THREE.Group` of one `Mesh` per named part for a Group-valued one
 * (`TODO/ui-016`).
 *
 * ## Why a Group body is not one mesh any more
 *
 * Every consumer used to flatten a Group with {@link toGeom3} before it reached
 * a mesh, and that call's `isGroup` branch runs `combine()` — a **CSG union** of
 * every visible part. After that boolean there is no polygon-level trace of
 * which part contributed what, so a raycast could only ever resolve to the
 * *body*, never to a part inside it. Pick depth is therefore not a click-handler
 * feature: the data a click handler would need has to survive as far as the
 * scene graph, which is what this function does.
 *
 * ## The one visual difference, stated out loud
 *
 * Skipping the union means two parts that **touch or overlap** can show a seam
 * or z-fight along their shared boundary, where the combined mesh drew one
 * clean unioned surface. That is an accepted tradeoff rather than a new defect:
 * `group.assemble`'s own design intent is that nothing is unioned away — every
 * operand's geometry survives, addressable by name — and its operands are
 * separate placed solids that a user dropped apart from each other.
 *
 * Two shipped composites **do** interpenetrate, measured rather than assumed
 * (`TODO/ui-016`'s regression-surface check): `hardware.bolt`'s `tap` overlaps
 * both `head` and `thread`, and `kit.anchor`'s `hole` overlaps `post` and shares
 * a coplanar face with it. **`hardware.bolt`'s case is now moot**: `tap` is
 * hidden by default (`TODO/render-004`, user decision 2026-09-26), and a hidden
 * part is skipped entirely by the per-part mesh path below — it is never drawn,
 * so it cannot visibly interpenetrate anything. `kit.anchor`'s `hole`/`post`
 * overlap is still live and still worth a look once the Kit section is
 * reachable from the Library (M2); see `TODO/VERIFY.md`. If it reads badly, the
 * fix is to fall back to the combined mesh for that body (the `holes` branch
 * below is the pattern), trading its pick depth for a clean surface, rather
 * than to re-union everything and lose pick depth for groups that never needed
 * it.
 *
 * Two cases deliberately keep the old single-mesh shape, because neither can be
 * drawn faithfully part-by-part:
 *
 * - **A group carrying holes.** `combine()` subtracts `group.holes` from the
 *   union, and a per-part mesh would render straight through them — a filled
 *   bore is a far worse regression than no pick depth. No recipe in the app
 *   builds one today; this is the guard for the first that does.
 * - **A group with no visible parts.** `combine()` throws on that, and so would
 *   any attempt to draw it; falling through to the old path keeps the error in
 *   the one place that already reports it well.
 *
 * Hidden parts (present in `parts`, absent from `names`) are skipped, exactly as
 * `combine()` skips them — a hidden tap-clearance solid must not become visible
 * just because the body stopped being unioned.
 *
 * @param {Geom3 | KernelGroup} geometry Body geometry, as `document.bodies()`
 *   reports it.
 * @param {MeshStandardMaterial} material Shared body material; not owned here.
 * @param {string} bodyId The body's lineage-root id, used for identification by
 *   the viewport's raycast on both the container and every part mesh.
 * @param {readonly string[]} [shownHiddenNames] Hidden part names to *also* build
 *   a mesh for, translucent (`TODO/ui-047`'s **Show hidden parts** toggle) — `[]`
 *   (the default) reproduces today's behaviour exactly: no hidden-part mesh is
 *   ever built for a body nobody asked to see into. Ignored on a bare solid and
 *   on a group with no visible parts (the two cases that keep the old
 *   single-combined-mesh shape below); a name absent from `geometry.parts` is
 *   silently skipped rather than thrown, since a stale toggle left over from a
 *   different body's id must not crash the scene.
 * @returns {Mesh | ThreeGroup} Named `bodyId` either way. A part mesh carries
 *   `userData.bodyId` and `userData.partName`; a bare solid's mesh carries
 *   neither, which is what makes "is this pickable to a deeper level?" a
 *   property of the hit object rather than a second lookup. A hidden-part mesh
 *   additionally carries `userData.hiddenPart = true`, which is what
 *   {@link paintBodyObject} reads to paint it translucent instead of through the
 *   ordinary override/recipe/palette precedence.
 */
export function createBodyObject(geometry, material, bodyId, shownHiddenNames = []) {
  if (hasNamedParts(geometry)) {
    const container = new ThreeGroup()
    container.name = bodyId
    for (const partName of geometry.names) {
      const mesh = new Mesh(geom3ToBufferGeometry(geometry.parts[partName]), material)
      mesh.name = bodyId
      mesh.userData.bodyId = bodyId
      mesh.userData.partName = partName
      container.add(mesh)
    }
    for (const partName of shownHiddenNames) {
      const part = geometry.parts[partName]
      if (!part || geometry.names.includes(partName)) continue
      const mesh = new Mesh(geom3ToBufferGeometry(part), material)
      mesh.name = bodyId
      mesh.userData.bodyId = bodyId
      mesh.userData.partName = partName
      mesh.userData.hiddenPart = true
      container.add(mesh)
    }
    return container
  }
  const mesh = new Mesh(geom3ToBufferGeometry(toGeom3(geometry)), material)
  mesh.name = bodyId
  return mesh
}

/**
 * Release the GPU resources of whatever {@link createBodyObject} built, part
 * meshes included. Materials are shared and stay the caller's, as with
 * {@link disposeMesh}.
 *
 * @param {Mesh | ThreeGroup} object
 * @returns {void}
 */
export function disposeBodyObject(object) {
  if (object instanceof ThreeGroup) {
    for (const child of object.children) disposeMesh(/** @type {Mesh} */ (child))
    object.clear()
    return
  }
  disposeMesh(/** @type {Mesh} */ (object))
}

/**
 * May an existing body object be kept as it is? Only when it was built for the **same
 * terminal record** *and* the **same evaluated geometry**, with the same hidden parts shown.
 *
 * The record id alone is not enough since `TODO/ui-052`: a row revised in place keeps its
 * id while its result changes — a composite whose model changed under the same terminal, a
 * snap left broken that now folds as identity. Keyed on the id alone, the viewport kept
 * drawing the old mesh while the bounds, the gizmo and the Inspector had all moved on. The
 * fold cache (`TODO/core-031`) hands back the very same geometry object for a record whose
 * inputs did not change, so the identity check costs nothing for an untouched body.
 *
 * @param {{ recordId?: string, geometry?: unknown, hiddenShownKey?: string }} userData The
 *   existing object's `userData`, read **before** it is refreshed for this pass.
 * @param {{ recordId: string, geometry: unknown }} body The body as the document now has it.
 * @param {string} hiddenShownKey
 * @returns {boolean}
 */
export function bodyObjectIsCurrent(userData, body, hiddenShownKey) {
  return (
    userData.recordId === body.recordId &&
    userData.geometry === body.geometry &&
    userData.hiddenShownKey === hiddenShownKey
  )
}

/**
 * Swap in freshly evaluated geometry for a body whose record changed, reusing
 * the object already in the scene when its **shape** — bare solid, or a group
 * with exactly these named parts — is unchanged.
 *
 * Returns `false` when the shape changed (a bare body that became a group, or a
 * group whose part list differs), so the caller rebuilds rather than trying to
 * patch a mismatched object. "Same shape" is a precondition worth checking rather
 * than assuming, because getting it wrong would render one body's geometry inside
 * another's part slots.
 *
 * A transform used to be the interesting case here, because it collapsed a group
 * into a bare solid and so always changed the shape. Since TODO/core-024 it no
 * longer does — `transform.translate`/`transform.rotate` map over a group's parts
 * and hand back a group with the same part list — so moving a composite now takes
 * the in-place per-part path below rather than forcing a rebuild. `ui-029`'s
 * param-edit rebuild is the case that genuinely can change shape (a cylinder
 * bisected into a two-part group, TODO/ui-028).
 *
 * @param {Mesh | ThreeGroup} object
 * @param {Geom3 | KernelGroup} geometry
 * @returns {boolean} True when the object was updated in place.
 */
export function updateBodyObject(object, geometry) {
  const grouped = hasNamedParts(geometry)
  if (grouped !== object instanceof ThreeGroup) return false

  if (!grouped) {
    const mesh = /** @type {Mesh} */ (object)
    const previous = mesh.geometry
    mesh.geometry = geom3ToBufferGeometry(toGeom3(geometry))
    previous.dispose()
    return true
  }

  const group = /** @type {KernelGroup} */ (geometry)
  const container = /** @type {ThreeGroup} */ (object)
  if (container.children.length !== group.names.length) return false
  for (let index = 0; index < group.names.length; index += 1) {
    if (container.children[index].userData.partName !== group.names[index]) return false
  }
  for (let index = 0; index < group.names.length; index += 1) {
    const mesh = /** @type {Mesh} */ (container.children[index])
    const previous = mesh.geometry
    mesh.geometry = geom3ToBufferGeometry(group.parts[group.names[index]])
    previous.dispose()
  }
  return true
}

/**
 * Release a mesh's GPU resources. Its material is shared across meshes and is
 * owned by the caller, so it is deliberately not disposed here.
 *
 * @param {Mesh} mesh
 * @returns {void}
 */
export function disposeMesh(mesh) {
  mesh.geometry.dispose()
}
