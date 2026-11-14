// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * three.js glue: the scene graph, and the WebGL renderer wrapper around it.
 *
 * Split deliberately in two:
 *
 * - `createSceneGraph()` builds scene/camera/lights/grid using nothing but plain
 *   three.js objects, so it is unit-testable in plain Node with no GPU — per
 *   CLAUDE.md's "always mock at the boundary ... a unit test must never need a
 *   real GPU context."
 * - `createViewport(canvas)` adds the one piece that genuinely needs a WebGL
 *   context, and is the only part an e2e/browser test has to cover.
 *
 * Renderer choice is recorded in `docs/decisions/rendering.md` (three.js,
 * pinned to an exact version because three.js does not follow semver).
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { buildGridLines } from './grid.js'
import { SCENE_THEMES, sameSceneTheme, sceneThemeOf } from './theme.js'

/**
 * Scene palettes, one per colour scheme: the background and grid slice of the fallback
 * {@link SCENE_THEMES} (`src/render/theme.js`). The live colours come from the theme tokens
 * (`--scene-background`, `--scene-grid-*`, `--axis-*`) through `readSceneTheme`; these are what
 * Node, workers and tests use, and `theme.spec.js` holds them equal to the CSS (`TODO/render-008`).
 *
 * Dark is primary and light follows `prefers-color-scheme`, per CLAUDE.md's UI
 * convention — and that has to include the *canvas*, not just the DOM chrome
 * around it. A hardcoded dark scene under light-mode overlays looks broken, and
 * it is invisible to any test that only reads the DOM: it was caught here by
 * looking at a screenshot from the hand-driven acceptance pass, which is the
 * whole reason that pass exists.
 *
 * Neither background is black. SECOND-ATTEMPT.md reports "the scene is very
 * dark" as a bug that shipped twice, so the dark ground sits at a readable slate
 * and `e2e/viewport-scaffold.e2e.js` samples real pixels to keep it that way.
 */
export const VIEWPORT_THEMES = Object.freeze({
  dark: viewportSlice(SCENE_THEMES.dark),
  light: viewportSlice(SCENE_THEMES.light),
})

/**
 * @param {Readonly<import('./theme.js').SceneTheme>} theme
 * @returns {Readonly<{ background: number, gridMinor: number, gridMajor: number, axisX: number, axisY: number }>}
 */
function viewportSlice(theme) {
  return Object.freeze({
    background: theme.background,
    gridMinor: theme.gridMinor,
    gridMajor: theme.gridMajor,
    axisX: theme.axisX,
    axisY: theme.axisY,
  })
}

/** @typedef {keyof typeof VIEWPORT_THEMES} ViewportTheme */
/** @typedef {import('./theme.js').SceneTheme} SceneTheme */

/** The default (primary) palette. */
export const VIEWPORT_COLORS = VIEWPORT_THEMES.dark

/** @typedef {import('./camera.js').OrbitCamera} OrbitCamera */

/**
 * @param {Float32Array} positions xyz triples
 * @param {number} color
 * @param {number} opacity
 * @returns {LineSegments}
 */
function lineSegments(positions, color, opacity) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new LineBasicMaterial({ color, transparent: opacity < 1, opacity })
  return new LineSegments(geometry, material)
}

/**
 * @typedef {object} SceneGraph
 * @property {Scene} scene
 * @property {PerspectiveCamera} camera
 * @property {Group} grid
 * @property {import('./grid.js').GridLines} gridLines
 * @property {(orbit: OrbitCamera) => void} applyCamera
 * @property {(aspect: number) => void} setAspect
 * @property {(theme: Readonly<SceneTheme> | string) => boolean} setTheme repaint the background,
 *   grid and lights from a {@link SceneTheme} (a scheme name stands for its fallback); false when
 *   nothing changed
 * @property {ViewportTheme} theme the current scheme's name
 * @property {Readonly<SceneTheme>} sceneTheme the colours currently drawn
 * @property {() => void} dispose
 */

/**
 * Build the scene graph: lights, grid, and a Z-up perspective camera.
 *
 * @param {object} [options]
 * @param {number} [options.fovDeg]
 * @param {Readonly<SceneTheme> | ViewportTheme} [options.theme] the colours to start with
 * @param {Parameters<typeof buildGridLines>[0]} [options.grid]
 * @returns {SceneGraph}
 */
export function createSceneGraph(options = {}) {
  const fovDeg = options.fovDeg ?? 45
  let theme = sceneThemeOf(options.theme)
  const scene = new Scene()
  const background = new Color(theme.background)
  scene.background = background

  // Lights, from line one. `render-009` in the previous attempt was literally
  // "scene has no light sources"; nothing here is lit yet (the grid uses
  // LineBasicMaterial), but the first primitive lands in `ui-010` on top of this
  // exact scene and must not rediscover that bug.
  // Colours from the theme (`--scene-light-*`), the same in both schemes today; `setTheme`
  // recolours these instances rather than replacing them.
  const hemisphere = new HemisphereLight(theme.lightSky, theme.lightGround, 1.6)
  scene.add(hemisphere)
  const ambient = new AmbientLight(theme.lightKey, 0.45)
  scene.add(ambient)
  const key = new DirectionalLight(theme.lightKey, 1.7)
  key.position.set(240, -320, 480)
  scene.add(key)
  const fill = new DirectionalLight(theme.lightFill, 0.6)
  fill.position.set(-300, 220, 140)
  scene.add(fill)

  const gridLines = buildGridLines(options.grid)
  const grid = new Group()
  grid.name = 'grid'
  const minor = lineSegments(gridLines.minor, theme.gridMinor, 0.75)
  const major = lineSegments(gridLines.major, theme.gridMajor, 1)
  const axisX = lineSegments(gridLines.axisX, theme.axisX, 1)
  const axisY = lineSegments(gridLines.axisY, theme.axisY, 1)
  grid.add(minor, major, axisX, axisY)
  scene.add(grid)
  /** @param {LineSegments} tier */
  const tierColor = (tier) => /** @type {LineBasicMaterial} */ (tier.material).color

  const camera = new PerspectiveCamera(fovDeg, 1, 1, 40000)
  // Z-up (CLAUDE.md's units/coordinate-space rule). The per-frame up vector is
  // overwritten by `applyCamera` from the orbit model, which stays well-defined
  // at the poles; this initial value only matters before the first sync.
  camera.up.set(0, 0, 1)

  // Pre-allocated scratch: `applyCamera` runs on every camera change and must
  // not allocate (CLAUDE.md Performance).
  const scratch = { x: 0, y: 0, z: 0 }

  return {
    scene,
    camera,
    grid,
    gridLines,

    applyCamera(orbit) {
      orbit.getPosition(scratch)
      camera.position.set(scratch.x, scratch.y, scratch.z)
      orbit.getUp(scratch)
      camera.up.set(scratch.x, scratch.y, scratch.z)
      const target = orbit.state.target
      camera.lookAt(target.x, target.y, target.z)
      if (camera.fov !== orbit.fovDeg) {
        camera.fov = orbit.fovDeg
        camera.updateProjectionMatrix()
      }
    },

    setAspect(aspect) {
      if (!(aspect > 0) || camera.aspect === aspect) return
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    },

    setTheme(next) {
      // A scheme name stands for its fallback; anything else that is not a SceneTheme is a no-op,
      // never an undefined palette that blanks the scene.
      if (typeof next === 'string' && next !== 'light' && next !== 'dark') return false
      const resolved = sceneThemeOf(next)
      if (sameSceneTheme(resolved, theme)) return false
      theme = resolved
      // `setHex` on the instances built above: once per theme change, nothing allocated for the
      // render path to pick up.
      background.setHex(theme.background)
      tierColor(minor).setHex(theme.gridMinor)
      tierColor(major).setHex(theme.gridMajor)
      tierColor(axisX).setHex(theme.axisX)
      tierColor(axisY).setHex(theme.axisY)
      hemisphere.color.setHex(theme.lightSky)
      hemisphere.groundColor.setHex(theme.lightGround)
      ambient.color.setHex(theme.lightKey)
      key.color.setHex(theme.lightKey)
      fill.color.setHex(theme.lightFill)
      return true
    },

    get theme() {
      return theme.scheme === 'light' ? 'light' : 'dark'
    },

    get sceneTheme() {
      return theme
    },

    dispose() {
      grid.traverse((object) => {
        if (object instanceof LineSegments) {
          object.geometry.dispose()
          const material = object.material
          if (Array.isArray(material)) material.forEach((m) => m.dispose())
          else material.dispose()
        }
      })
      scene.clear()
    },
  }
}

/**
 * Get a scene ready to draw again on a context the browser has just restored (`TODO/render-006`).
 *
 * three.js does most of the work itself. Its own `webglcontextrestored` handler, registered on the
 * canvas before the app's, re-runs `initGLContext`, which replaces every internal map (properties,
 * attributes, geometries, textures, programs, render states) with an empty one. On the next
 * `render`, each geometry is re-uploaded from the typed arrays its `BufferAttribute`s still hold,
 * each material's program is recompiled, render targets are re-created, and viewport and scissor
 * are re-applied. That works only because nothing in this app releases an attribute's array after
 * upload (no `onUpload` disposer) and no texture's `ImageBitmap` is closed while still in use.
 *
 * What this adds is to mark every material, and every texture with image data, `needsUpdate`, so the
 * re-upload does not depend on three's internal version bookkeeping. three.js does not follow
 * semver (it is pinned exactly in `package.json`). Lights and the grid are plain scene objects, so
 * they come back with everything else. The frame loop, `capture_view` and the banner are the
 * component's job.
 *
 * Runs once per restore, never per frame, so the traversal's allocations are fine.
 *
 * @param {Pick<WebGLRenderer, 'getContext'>} renderer
 * @param {import('three').Object3D} scene
 * @returns {{ materials: number, textures: number } | null} what was marked, or null while the
 *   context is still lost (a restore event that raced a second loss)
 */
export function rebuildGpuResources(renderer, scene) {
  const gl = renderer.getContext()
  if (!gl || gl.isContextLost()) return null
  /** @type {Set<import('three').Material>} */
  const materials = new Set()
  /** @type {Set<import('three').Texture>} */
  const textures = new Set()
  scene.traverse((object) => {
    const material = /** @type {any} */ (object).material
    if (!material) return
    for (const each of Array.isArray(material) ? material : [material]) {
      if (materials.has(each)) continue
      materials.add(each)
      for (const value of Object.values(each)) {
        if (value && value.isTexture && value.image) textures.add(value)
      }
    }
  })
  for (const material of materials) material.needsUpdate = true
  for (const texture of textures) texture.needsUpdate = true
  return { materials: materials.size, textures: textures.size }
}

/**
 * @typedef {object} Viewport
 * @property {SceneGraph} graph
 * @property {WebGLRenderer} renderer the current renderer; replaced by `replaceRenderer`
 * @property {(widthPx: number, heightPx: number) => void} setSize
 * @property {(orbit: OrbitCamera) => void} render
 * @property {() => boolean} isContextLost
 * @property {(canvas: HTMLCanvasElement) => void} replaceRenderer dispose the renderer and draw the
 *   same scene graph through a fresh one on `canvas`; throws, keeping the old one, if WebGL fails
 * @property {() => void} dispose
 */

/**
 * Attach a WebGL renderer to a canvas.
 *
 * Throws if a WebGL context cannot be created (an old browser, a lost GPU
 * process, a hardened privacy setting) — `Viewport.vue` catches that and shows a
 * fallback while keeping the navigation chrome live, because the camera model is
 * independent of WebGL.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {number} [options.fovDeg]
 * @param {Readonly<SceneTheme> | ViewportTheme} [options.theme]
 * @param {number} [options.maxPixelRatio]
 * @returns {Viewport}
 */
export function createViewport(canvas, options = {}) {
  const graph = createSceneGraph({ fovDeg: options.fovDeg, theme: options.theme })
  /** @param {HTMLCanvasElement} target */
  const makeRenderer = (target) => {
    const made = new WebGLRenderer({
      canvas: target,
      antialias: true,
      // Keeps the drawing buffer readable after compositing, so Playwright can
      // sample real rendered pixels across all three engines and assert the scene
      // is neither blank nor uniformly dark. Cheap at this scene's size.
      preserveDrawingBuffer: true,
    })
    made.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, options.maxPixelRatio ?? 2))
    return made
  }
  let renderer = makeRenderer(canvas)
  // The last size asked for, so a replacement renderer on a fresh canvas starts at it.
  let sizeWidthPx = 0
  let sizeHeightPx = 0

  return {
    graph,
    get renderer() {
      return renderer
    },

    setSize(widthPx, heightPx) {
      if (!(widthPx > 0) || !(heightPx > 0)) return
      sizeWidthPx = widthPx
      sizeHeightPx = heightPx
      renderer.setSize(widthPx, heightPx, false)
      graph.setAspect(widthPx / heightPx)
    },

    render(orbit) {
      graph.applyCamera(orbit)
      renderer.render(graph.scene, graph.camera)
    },

    isContextLost() {
      const gl = renderer.getContext()
      return !gl || gl.isContextLost()
    },

    replaceRenderer(nextCanvas) {
      // The scene graph (meshes, materials, lights, grid) holds no GPU handles of its own: three
      // keeps them in per-renderer maps, so a new renderer uploads all of it afresh on its first
      // render. Only the renderer is replaced, never the scene, the document or the camera.
      const previous = renderer
      try {
        previous.dispose()
      } catch {
        // Disposing into a lost context deletes nothing; it must not stop the replacement.
      }
      renderer = makeRenderer(nextCanvas)
      if (sizeWidthPx > 0 && sizeHeightPx > 0) renderer.setSize(sizeWidthPx, sizeHeightPx, false)
    },

    dispose() {
      graph.dispose()
      renderer.dispose()
    },
  }
}
