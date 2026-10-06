// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A tiny op catalogue for the tool-registry specs (`TODO/ai-002`): "mock at the
 * boundary" (`CLAUDE.md`) applied to the kernel registry.
 *
 * The ops are fakes, but their geometry is real `@jscad/modeling` output, because the
 * read tools measure bounds and the create tool measures a resting height. A fake that
 * returned a tag object would leave both untested.
 *
 * - `fake.block` is a creatable op: `operandCount: 0` plus `ui` metadata, the same two
 *   things that put a real op in the Library.
 * - `fake.internal` is `operandCount: 0` with no `ui`, so it must **not** be creatable.
 * - `boolean.subtract` and `transform.translate` reuse real op names, the way
 *   `document.spec.js` reuses `style.recolor`, because `operate` maps an op name to the
 *   record shape the Operations toolbar writes for it.
 * - `fake.probe` is a one-operand op nobody has mapped, so `operate` must not offer it.
 *
 * @module ai/tools/__fixtures__/fakeRegistry
 */

import modeling from '@jscad/modeling'

const { booleans, primitives, transforms } = modeling

/** @typedef {import('../../../core/kernel/registry.js').RegistryEntry} RegistryEntry */

/** @type {Readonly<Record<string, RegistryEntry>>} */
export const fakeRegistry = Object.freeze({
  'fake.block': Object.freeze({
    kind: /** @type {'native'} */ ('native'),
    operandCount: /** @type {0} */ (0),
    build: (/** @type {any} */ { params }) => {
      const size = params.sizeMm ?? 10
      if (!(typeof size === 'number' && size > 0)) throw new Error(`fake.block: sizeMm must be positive, got ${size}`)
      return primitives.cuboid({ size: [size, size, size], center: params.center ?? [0, 0, 0] })
    },
    ui: Object.freeze({ label: 'Block', defaults: Object.freeze({ sizeMm: 10 }) }),
  }),
  'fake.internal': Object.freeze({
    kind: /** @type {'native'} */ ('native'),
    operandCount: /** @type {0} */ (0),
    build: () => primitives.cuboid({ size: [1, 1, 1] }),
  }),
  'boolean.subtract': Object.freeze({
    kind: /** @type {'native'} */ ('native'),
    operandCount: /** @type {'2+'} */ ('2+'),
    subPartOperands: true,
    build: (/** @type {any} */ { inputs }) => booleans.subtract(inputs),
  }),
  'transform.translate': Object.freeze({
    kind: /** @type {'native'} */ ('native'),
    operandCount: /** @type {1} */ (1),
    build: (/** @type {any} */ { params, inputs }) => transforms.translate(params.vector, inputs[0]),
  }),
  'fake.probe': Object.freeze({
    kind: /** @type {'native'} */ ('native'),
    operandCount: /** @type {1} */ (1),
    build: (/** @type {any} */ { inputs }) => inputs[0],
  }),
})
