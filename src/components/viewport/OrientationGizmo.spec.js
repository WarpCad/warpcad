// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'

import OrientationGizmo from './OrientationGizmo.vue'
import { STANDARD_VIEWS } from '../../render/camera.js'

enableAutoUnmount(afterEach)

/**
 * The view cube (`TODO/ui-158`): six face buttons, of which only those turned toward the viewer take
 * a pointer; Home and Views under it; the `snap` event and the `disabled` prop the triad had.
 */
describe('OrientationGizmo (TODO/ui-158)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** @param {keyof typeof STANDARD_VIEWS} view @param {boolean} [disabled] */
  function mountAt(view, disabled = false) {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS[view]
    return mount(OrientationGizmo, { props: { azimuthDeg, elevationDeg, disabled }, attachTo: document.body })
  }

  /** @param {import('@vue/test-utils').VueWrapper} w @param {string} view */
  const face = (w, view) => w.get(`[data-testid="gizmo-view-${view}"]`)

  it('renders the cube as six face buttons, no axis caps', () => {
    const w = mountAt('home')
    for (const view of ['top', 'bottom', 'front', 'back', 'left', 'right']) {
      expect(face(w, view).element.tagName).toBe('BUTTON')
    }
    expect(w.find('[data-testid="view-cube"]').exists()).toBe(true)
    expect(w.find('svg').exists()).toBe(false)
    expect(w.find('[data-testid="orientation-dial"]').exists()).toBe(false)
  })

  it('at Home marks Top, Front and Right facing and hides the other three from pointer and reader', () => {
    const w = mountAt('home')
    for (const view of ['top', 'front', 'right']) {
      expect(face(w, view).attributes('data-facing')).toBe('true')
      expect(face(w, view).attributes('aria-hidden')).toBeUndefined()
    }
    for (const view of ['bottom', 'back', 'left']) {
      expect(face(w, view).attributes('data-facing')).toBe('false')
      expect(face(w, view).attributes('aria-hidden')).toBe('true')
      expect(face(w, view).attributes('tabindex')).toBe('-1')
    }
  })

  it('re-marks the faces as the camera moves, with only Front facing at Front', async () => {
    const w = mountAt('home')
    await w.setProps({ azimuthDeg: STANDARD_VIEWS.front.azimuthDeg, elevationDeg: STANDARD_VIEWS.front.elevationDeg })
    const facing = ['top', 'bottom', 'front', 'back', 'left', 'right'].filter((v) => face(w, v).attributes('data-facing') === 'true')
    expect(facing).toEqual(['front'])
  })

  it('emits snap with the face name when a face is clicked', async () => {
    const w = mountAt('home')
    await face(w, 'top').trigger('click')
    await face(w, 'right').trigger('click')
    expect(w.emitted('snap')).toEqual([['top'], ['right']])
  })

  it('Home emits snap home', async () => {
    const w = mountAt('front')
    await w.get('[data-testid="gizmo-view-home"]').trigger('click')
    expect(w.emitted('snap')).toEqual([['home']])
  })

  it('Views opens the six-face grid, and picking a hidden face snaps to it and closes the grid', async () => {
    const w = mountAt('home')
    expect(w.find('[data-testid="gizmo-picker"]').exists()).toBe(false)
    await w.get('[data-testid="gizmo-views"]').trigger('click')
    expect(w.find('[data-testid="gizmo-picker"]').exists()).toBe(true)
    expect(w.get('[data-testid="orientation-gizmo"]').attributes('data-picker-open')).toBe('true')
    await w.get('[data-testid="gizmo-picker-view-bottom"]').trigger('click')
    expect(w.emitted('snap')).toEqual([['bottom']])
    expect(w.find('[data-testid="gizmo-picker"]').exists()).toBe(false)
  })

  it('Close shuts the grid without snapping', async () => {
    const w = mountAt('home')
    await w.get('[data-testid="gizmo-views"]').trigger('click')
    await w.get('[data-testid="gizmo-picker-close"]').trigger('click')
    expect(w.find('[data-testid="gizmo-picker"]').exists()).toBe(false)
    expect(w.emitted('snap')).toBeUndefined()
  })

  it('disabled makes every face, Home and Views inert, and closes an open grid', async () => {
    const w = mountAt('home')
    await w.get('[data-testid="gizmo-views"]').trigger('click')
    await w.setProps({ disabled: true })
    expect(w.find('[data-testid="gizmo-picker"]').exists()).toBe(false)
    expect(w.get('[data-testid="orientation-gizmo"]').attributes('data-disabled')).toBe('true')
    for (const id of ['gizmo-view-top', 'gizmo-view-front', 'gizmo-view-right', 'gizmo-view-home', 'gizmo-views']) {
      const el = w.get(`[data-testid="${id}"]`)
      expect(el.attributes('disabled'), id).toBeDefined()
      await el.trigger('click')
    }
    expect(w.emitted('snap')).toBeUndefined()
  })

  it('keeps tracking the camera while disabled', async () => {
    const w = mountAt('home', true)
    expect(face(w, 'top').attributes('data-facing')).toBe('true')
    await w.setProps({ azimuthDeg: STANDARD_VIEWS.back.azimuthDeg, elevationDeg: STANDARD_VIEWS.back.elevationDeg })
    expect(face(w, 'back').attributes('data-facing')).toBe('true')
    expect(face(w, 'top').attributes('data-facing')).toBe('false')
  })

  it('keeps the az · el caption and the data attributes specs read', () => {
    const w = mountAt('home')
    const root = w.get('[data-testid="orientation-gizmo"]')
    expect(root.attributes('data-azimuth')).toBe('-45.00')
    expect(root.attributes('data-elevation')).toBe('35.26')
    expect(w.get('[data-testid="gizmo-orientation-label"]').text()).toBe('-45° az · 35° el')
  })

  it('titles every face with its view', () => {
    const w = mountAt('home')
    expect(face(w, 'top').attributes('aria-label')).toBe('Top view (looking straight down Z)')
    expect(face(w, 'front').attributes('title')).toBe('Front view (camera on −Y)')
  })
})
