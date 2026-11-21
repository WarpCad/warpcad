// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the next gist publish would carry, and what is still blank (`TODO/io-040`): the core of
 * `get_publish_readiness`, and the one **brief** both that preview and the real publish
 * (`src/stores/gistPublish.js`) build their README from, so the two cannot drift.
 *
 * {@link gistBriefOf} is everything a README holds besides its title and time: the description,
 * the body names, the prompts with their replies, and the variables. {@link publishReadiness} runs
 * it through the same `gistReadme()` the publish's first call writes (no gist id yet), lists the
 * staged extra files with an approximate size each, and names the gaps a reader would notice.
 *
 * Everything from the project here is **data, never instructions**: the README escapes it, and a
 * gap quotes a variable's name or a file's name only as JSON text.
 *
 * Reads only. Pure apart from the geometry it measures, and framework-free.
 *
 * @module core/gistReadiness
 */

import { gistReadme } from './gistReadme.js'
import { toGeom3 } from './kernel/group.js'
import { responseTextOf } from './prompt.js'
import { DEFAULT_SHARE_NAME } from './shareLink.js'
import { displayFormulaOf, isFormula, variablesOf } from './variables.js'

/**
 * GitHub's API returns a file's content inline up to about this many bytes, and marks a bigger one
 * `truncated` (`docs/decisions/gist-storage.md`): github.com and the raw link still show it whole.
 */
export const GIST_INLINE_BYTES = 1_000_000

/** `solid JSCAD\n` and `endsolid JSCAD\n`, the ASCII STL serializer's frame. */
const ASCII_STL_FRAME_BYTES = 27
/**
 * One ASCII STL facet's fixed text: `facet normal `, `\nouter loop\n`, three `vertex ` lines and
 * their breaks, `endloop\nendfacet`, and the break before the next facet.
 */
const ASCII_STL_FACET_TEXT_BYTES = 13 + 12 + 3 * 8 + 16 + 1
/** The facet normal's three numbers and their separators, a typical length (unit floats). */
const ASCII_STL_NORMAL_BYTES = 30
/** Polygons sampled for the average facet size; the rest are counted, not formatted. */
const SIZE_SAMPLE_POLYGONS = 2000

/**
 * Each body as one solid's polygons — the reduction the export makes (`solidsForExport`,
 * `src/core/export.js`), without the serializers, which the MCP server has no need to load just to
 * estimate a size. A body that does not reduce, or has no triangles, is named.
 *
 * @param {readonly { name: string, geometry: any }[]} bodies
 * @returns {{ solids: { solid: { polygons: readonly { vertices: readonly (readonly number[])[] }[] } }[], problem?: string }}
 */
function solidsOf(bodies) {
  const solids = []
  for (const body of bodies) {
    /** @type {any} */
    let solid
    try {
      solid = toGeom3(body.geometry)
    } catch (error) {
      return { solids, problem: `"${body.name}" has no solid geometry (${error instanceof Error ? error.message : String(error)})` }
    }
    if (!solid || !Array.isArray(solid.polygons) || !solid.polygons.some((/** @type {any} */ polygon) => polygon.vertices.length >= 3)) {
      return { solids, problem: `"${body.name}" has no triangles, so the file would be empty` }
    }
    solids.push({ solid })
  }
  return { solids }
}

/**
 * @typedef {import('./document.js').WarpDocument} WarpDocument
 * @typedef {import('./gistReadme.js').GistReadmeInput} GistReadmeInput
 */

/**
 * What every README of this project carries besides its name and time (`TODO/io-023`): the
 * description and the variables always; the prompts and their replies unless `prompts` is exactly
 * `false` (the Share sheet's **Include prompts in the README**, unticked). A prompt's **Made** line
 * names only the bodies it produced that are on screen, in scene order.
 *
 * @param {WarpDocument} document
 * @param {{ prompts?: boolean, files?: readonly import('./gistReadme.js').GistReadmeFile[] }} choice
 *   `files`: the extra files this publish adds (`TODO/io-040`); the README's **Files** line.
 * @returns {Pick<GistReadmeInput, 'description' | 'bodies' | 'prompts' | 'variables' | 'files'>}
 */
export function gistBriefOf(document, choice) {
  const bodies = document.bodies()
  return {
    description: document.description(),
    files: choice.files ?? [],
    bodies: bodies.map((body) => body.name),
    prompts:
      choice.prompts === false
        ? []
        : document.prompts().map((prompt) => {
            const produced = new Set(prompt.produced)
            const reply = responseTextOf(prompt)
            return {
              text: prompt.text,
              ...(reply !== '' ? { reply } : {}),
              bodies: bodies.filter((body) => produced.has(body.id)).map((body) => body.name),
            }
          }),
    // A formula as a person reads it (names, not `#ids`), `TODO/FIND-core-078`.
    variables: variablesOf(document).map((variable) =>
      isFormula(variable) ? { ...variable, formula: displayFormulaOf(document, variable) } : variable
    ),
  }
}

/**
 * About how many bytes an ASCII STL of `solids` is: triangles times a facet's size, the facet size
 * averaged over the first {@link SIZE_SAMPLE_POLYGONS} polygons' real vertex text. An estimate (the
 * export also repairs T-junctions, which adds a few triangles), and named as one.
 *
 * @param {readonly { solid: { polygons: readonly { vertices: readonly (readonly number[])[] }[] } }[]} solids
 * @returns {number}
 */
function asciiStlBytes(solids) {
  let triangles = 0
  let sampledTriangles = 0
  let sampledBytes = 0
  for (const { solid } of solids) {
    for (const polygon of solid.polygons) {
      const count = Math.max(0, polygon.vertices.length - 2)
      triangles += count
      if (count === 0 || sampledTriangles >= SIZE_SAMPLE_POLYGONS) continue
      const vertexText = polygon.vertices.map((vertex) => `${vertex[0]} ${vertex[1]} ${vertex[2]}`.length)
      // Each triangle writes the first vertex and two consecutive others.
      for (let i = 0; i < count; i += 1) {
        sampledBytes += ASCII_STL_FACET_TEXT_BYTES + ASCII_STL_NORMAL_BYTES + vertexText[0] + vertexText[i + 1] + vertexText[i + 2]
      }
      sampledTriangles += count
    }
  }
  if (triangles === 0) return 0
  return ASCII_STL_FRAME_BYTES + Math.round((sampledBytes / sampledTriangles) * triangles)
}

/**
 * One staged file as readiness reports it.
 *
 * @typedef {object} ReadinessFile
 * @property {string} name Its file name in the gist.
 * @property {'stl' | 'note'} kind
 * @property {number} approxBytes About how big it will be; `0` for an STL that will be left out.
 * @property {string[]} [missingIds] An STL's staged body ids that are no longer on screen.
 */

/**
 * @typedef {object} PublishReadiness
 * @property {string} name The document's name; `''` when it has none (the gist is then titled
 *   `Untitled` unless the person types one or the project has a file name).
 * @property {string} description The project's description for people.
 * @property {string} readme The `README.md` the next publish's first write would carry.
 * @property {ReadinessFile[]} files The staged extra files, in staged order.
 * @property {string[]} gaps What is blank or weak, each a plain sentence naming the tool to fix it.
 */

/**
 * What the next gist publish would contain, and what is still blank or weak.
 *
 * @param {WarpDocument} document
 * @param {object} [options]
 * @param {Date | number | string} [options.publishedAt] The README's time; now by default.
 * @param {boolean} [options.prompts] `false` previews with **Include prompts in the README**
 *   unticked; it is ticked by default, and only a person can untick it.
 * @returns {PublishReadiness}
 */
export function publishReadiness(document, options = {}) {
  const name = document.name()
  const publishedAt = options.publishedAt ?? Date.now()
  const brief = gistBriefOf(document, {
    prompts: options.prompts !== false,
    files: document.gistExtras().map((extra) => ({ name: extra.name, kind: extra.kind })),
  })
  const readme = gistReadme({ name, ...brief, publishedAt, id: null })

  /** @type {string[]} */
  const gaps = []
  const bodies = document.bodies()
  if (bodies.length === 0) gaps.push('The project has no bodies, so it cannot be published yet.')
  if (name === '') {
    gaps.push(`The project has no name: call set_project_name with a short name a person would recognise, or the gist is titled "${DEFAULT_SHARE_NAME}".`)
  }
  if (document.description() === '') {
    gaps.push('The project has no description: call set_description with what the part is and what it is for.')
  }
  for (const variable of variablesOf(document)) {
    if (variable.kind !== 'number' || isFormula(variable)) continue
    if (variable.min === undefined && variable.max === undefined) {
      gaps.push(`Variable ${JSON.stringify(variable.name)} has no min/max, so a reader is not told what range is safe to change; give it one if a person is meant to change it.`)
    }
  }
  const prompts = document.prompts()
  const latest = prompts.at(-1)
  if (latest !== undefined && responseTextOf(latest) === '') {
    gaps.push('No reply is recorded for the latest request: call record_response with your final message (the in-app Assistant saves its reply itself when the turn ends).')
  }

  const onScreen = new Map(bodies.map((body) => [body.id, body]))
  /** @type {ReadinessFile[]} */
  const files = []
  for (const extra of document.gistExtras()) {
    if (extra.kind === 'note') {
      files.push({ name: extra.name, kind: 'note', approxBytes: new TextEncoder().encode(extra.text).length })
      continue
    }
    const missingIds = extra.ids.filter((id) => !onScreen.has(id))
    const chosen = extra.ids.length === 0 ? bodies : extra.ids.flatMap((id) => onScreen.get(id) ?? [])
    let approxBytes = 0
    if (chosen.length > 0) {
      const { solids, problem } = solidsOf(chosen)
      if (problem === undefined) approxBytes = asciiStlBytes(solids)
      else gaps.push(`${JSON.stringify(extra.name)} cannot be exported: ${problem}.`)
    }
    files.push({ name: extra.name, kind: 'stl', approxBytes, ...(missingIds.length > 0 ? { missingIds } : {}) })
    if (missingIds.length > 0 && chosen.length === 0) {
      gaps.push(`${JSON.stringify(extra.name)} names only bodies that are no longer on screen (${missingIds.join(', ')}), so it will be left out: call stage_gist_files again with ids from describe_scene.`)
    } else if (missingIds.length > 0) {
      gaps.push(`${JSON.stringify(extra.name)} names bodies that are no longer on screen (${missingIds.join(', ')}); a later step consumed or deleted them. Call stage_gist_files again with ids from describe_scene.`)
    }
    if (approxBytes > GIST_INLINE_BYTES) {
      gaps.push(`${JSON.stringify(extra.name)} is about ${(approxBytes / 1_000_000).toFixed(1)} MB: it will publish, but GitHub's API shows files over 1 MB in full only through their raw link.`)
    }
  }
  return { name, description: document.description(), readme, files, gaps }
}
