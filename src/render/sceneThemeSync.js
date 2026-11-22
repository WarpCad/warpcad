// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading the 3D view's colours from the theme tokens and applying them (`TODO/render-008`), moved
 * out of `Viewport.vue` without a behaviour change (`TODO/ui-152`). Framework-free: the resolved
 * scheme is a getter, and the controllers it recolours are handed in.
 */
import { readSceneTheme, sceneThemeOf } from './theme.js'

/**
 * @typedef {object} SceneThemeSyncDeps
 * @property {() => ('dark' | 'light')} scheme The resolved theme's brightness.
 * @property {() => ({ graph: { setTheme: (colors: any) => void } } | null)} getViewport The three.js viewport, or `null`.
 * @property {{ applyMaterialTheme: (colors: any) => void }} bodyScene
 * @property {{ setColor: (color: any) => void }} placementGhost
 * @property {{ setColor: (color: any) => void }} sketchPreview
 * @property {() => void} scheduleRender
 */

/**
 * Create the scene theme reader and applier.
 *
 * @param {SceneThemeSyncDeps} deps
 * @returns {{
 *   read: () => Readonly<import('./theme.js').SceneTheme>,
 *   onThemeChange: () => void,
 * }}
 */
export function createSceneThemeSync({ scheme, getViewport, bodyScene, placementGhost, sketchPreview, scheduleRender }) {
  /**
   * The 3D view's colours, read from the theme tokens. Called on mount and on a theme change only,
   * never from the frame or pointer path: `getComputedStyle` forces a style flush. A token three.js
   * cannot use (or no stylesheet at all) is reported and the fallback for the scheme is drawn
   * instead, never black.
   *
   * @returns {Readonly<import('./theme.js').SceneTheme>}
   */
  function read() {
    try {
      return readSceneTheme(getComputedStyle(document.documentElement), scheme())
    } catch (error) {
      console.error(error)
      return sceneThemeOf(scheme())
    }
  }

  return {
    read,

    /** One token read per theme change, after `useTheme` has set `<html data-theme>`. */
    onThemeChange() {
      const colors = read()
      // Recolour the bodies', the placement ghost's and the sketch preview's materials; a body's
      // user colour is untouched.
      placementGhost.setColor(colors.bodyGhost)
      sketchPreview.setColor(colors.bodyGhost)
      bodyScene.applyMaterialTheme(colors)
      getViewport()?.graph.setTheme(colors)
      scheduleRender()
    },
  }
}
