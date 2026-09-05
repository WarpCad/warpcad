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

/**
 * Scene palettes, one per colour scheme.
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
  dark: Object.freeze({
    background: 0x161a21,
    gridMinor: 0x2f3742,
    gridMajor: 0x4d5a6b,
    axisX: 0xc75c5c,
    axisY: 0x6aa84f,
  }),
  light: Object.freeze({
    background: 0xe9edf3,
    gridMinor: 0xc2cad6,
    gridMajor: 0x8c99ab,
    axisX: 0xb04a45,
    axisY: 0x4f7f3a,
  }),
})

/** @typedef {keyof typeof VIEWPORT_THEMES} ViewportTheme */

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
 * @property {(name: string) => boolean} setTheme repaints scene + grid; false if unchanged
 * @property {ViewportTheme} theme
 * @property {() => void} dispose
 */

/**
 * Build the scene graph: lights, grid, and a Z-up perspective camera.
 *
 * @param {object} [options]
 * @param {number} [options.fovDeg]
 * @param {ViewportTheme} [options.theme]
 * @param {Parameters<typeof buildGridLines>[0]} [options.grid]
 * @returns {SceneGraph}
 */
export function createSceneGraph(options = {}) {
  const fovDeg = options.fovDeg ?? 45
  let theme = VIEWPORT_THEMES[options.theme ?? 'dark'] ?? VIEWPORT_THEMES.dark
  const scene = new Scene()
  const background = new Color(theme.background)
  scene.background = background

  // Lights, from line one. `render-009` in the previous attempt was literally
  // "scene has no light sources"; nothing here is lit yet (the grid uses
  // LineBasicMaterial), but the first primitive lands in `ui-010` on top of this
  // exact scene and must not rediscover that bug.
  scene.add(new HemisphereLight(0xc8dcff, 0x20262f, 1.6))
  scene.add(new AmbientLight(0xffffff, 0.45))
  const key = new DirectionalLight(0xffffff, 1.7)
  key.position.set(240, -320, 480)
  scene.add(key)
  const fill = new DirectionalLight(0x9fb6d4, 0.6)
  fill.position.set(-300, 220, 140)
  scene.add(fill)

  const gridLines = buildGridLines(options.grid)
  const grid = new Group()
  grid.name = 'grid'
  grid.add(lineSegments(gridLines.minor, theme.gridMinor, 0.75))
  grid.add(lineSegments(gridLines.major, theme.gridMajor, 1))
  grid.add(lineSegments(gridLines.axisX, theme.axisX, 1))
  grid.add(lineSegments(gridLines.axisY, theme.axisY, 1))
  scene.add(grid)

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

    setTheme(name) {
      // Explicit rather than an index lookup: an unknown name must be a no-op,
      // never an undefined palette that blanks the scene.
      const next =
        name === 'light' ? VIEWPORT_THEMES.light : name === 'dark' ? VIEWPORT_THEMES.dark : null
      if (!next || next === theme) return false
      theme = next
      background.setHex(theme.background)
      // Same order the tiers were added in above: minor, major, X axis, Y axis.
      const tierColors = [theme.gridMinor, theme.gridMajor, theme.axisX, theme.axisY]
      grid.children.forEach((child, index) => {
        if (!(child instanceof LineSegments)) return
        const material = /** @type {LineBasicMaterial} */ (child.material)
        material.color.setHex(tierColors[index])
      })
      return true
    },

    get theme() {
      return theme === VIEWPORT_THEMES.light ? 'light' : 'dark'
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
 * @typedef {object} Viewport
 * @property {SceneGraph} graph
 * @property {WebGLRenderer} renderer
 * @property {(widthPx: number, heightPx: number) => void} setSize
 * @property {(orbit: OrbitCamera) => void} render
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
 * @param {ViewportTheme} [options.theme]
 * @param {number} [options.maxPixelRatio]
 * @returns {Viewport}
 */
export function createViewport(canvas, options = {}) {
  const graph = createSceneGraph({ fovDeg: options.fovDeg, theme: options.theme })
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    // Keeps the drawing buffer readable after compositing, so Playwright can
    // sample real rendered pixels across all three engines and assert the scene
    // is neither blank nor uniformly dark. Cheap at this scene's size.
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, options.maxPixelRatio ?? 2))

  return {
    graph,
    renderer,

    setSize(widthPx, heightPx) {
      if (!(widthPx > 0) || !(heightPx > 0)) return
      renderer.setSize(widthPx, heightPx, false)
      graph.setAspect(widthPx / heightPx)
    },

    render(orbit) {
      graph.applyCamera(orbit)
      renderer.render(graph.scene, graph.camera)
    },

    dispose() {
      graph.dispose()
      renderer.dispose()
    },
  }
}
