// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../src/core/document.js'
import { serializeProject } from '../src/core/project.js'
import { loadProjectText } from './projectFile.js'

/**
 * `TODO/ui-089`: the server re-reads the project file on every call and writes it back. What
 * the user hid in the app travels in the state line, so the server must load it like every
 * other state-line field — or its next write would wipe the hides (and turn their stamps into
 * shows, un-hiding them in the app's next merge).
 */
describe('loadProjectText keeps what the user hid (TODO/ui-089)', () => {
  it('a file with hidden bodies reloads with them hidden and re-saves byte-identically', () => {
    const app = createDocument()
    app.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, { origin: 'local' })
    app.append({ id: 'cube-2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [10, 10, 10], center: [30, 0, 5] } }, { origin: 'local' })
    app.setViewHidden('cube-2', { hidden: true }, { origin: 'local' })
    const text = serializeProject(app)

    const served = loadProjectText(text, 'part.warpcad')
    expect(served.bodies().map((body) => [body.id, body.viewHidden === true])).toEqual([['cube-1', false], ['cube-2', true]])
    expect(serializeProject(served)).toBe(text)
  })
})
