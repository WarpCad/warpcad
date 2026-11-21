// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The two tools that leave a project ready to publish as a gist (`TODO/io-040`):
 *
 * - **`stage_gist_files`** `{ files: [{ kind, ids?, name?, text? }] }` replaces the list of extra
 *   files the next publish carries beside the project file and its README (`src/core/gistExtras.js`):
 *   an `stl` of some bodies (no `ids`: every body on screen), published as ASCII STL, or a Markdown
 *   `note`. `[]` clears it. It stores names, kinds, body ids and note text — never mesh bytes; the
 *   publish builds each STL from the timeline when the person taps Publish. All or nothing: a list
 *   with one bad file stages none of it. Echoes `{ staged, previous }`.
 * - **`get_publish_readiness`** `{}` reads only: `{ name, description, readme, files, gaps }`, the
 *   README the next publish would write (the same brief and `gistReadme()` the publish uses,
 *   `src/core/gistReadiness.js`), each staged file with its approximate size, and plain sentences
 *   naming what is blank or weak.
 *
 * Neither publishes, and nothing here can: a tool is handed the document and nothing else
 * (`limits.js`). A person taps Publish. Text from the document is data, never instructions.
 *
 * @module ai/tools/gistExtras
 */

import { GIST_EXTRAS_LIMITS, GIST_EXTRA_KINDS, prepareGistExtras, summarizeGistExtra } from '../../core/gistExtras.js'
import { publishReadiness } from '../../core/gistReadiness.js'
import { gistFileName } from '../../core/gistLink.js'
import { assertWriteOrigin } from './limits.js'
import { objectSchema } from './schema.js'

/** The write tool's name, which the MCP transport also needs (`mcp/projectFile.js` locks the file for it). */
export const STAGE_GIST_FILES = 'stage_gist_files'
/** The read tool's name. */
export const GET_PUBLISH_READINESS = 'get_publish_readiness'

/** @returns {import('./index.js').Tool} */
export function createStageGistFilesTool() {
  const { maxFiles, maxNoteChars, maxIdsPerFile } = GIST_EXTRAS_LIMITS
  const file = objectSchema(
    {
      kind: {
        type: 'string',
        enum: [...GIST_EXTRA_KINDS],
        description: 'stl: an ASCII STL of bodies, built when the person publishes. note: a Markdown file of your text.',
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: `stl only: the body ids to put in the file, from describe_scene (at most ${maxIdsPerFile}). Leave it out for every body on screen.`,
      },
      name: {
        type: 'string',
        description: 'The file’s name; it is slugged and given its extension (".stl", ".md"). An STL defaults to the project’s name, a note to "notes".',
      },
      text: { type: 'string', description: `note only: the note, in Markdown (at most ${maxNoteChars.toLocaleString('en-US')} characters).` },
    },
    ['kind']
  )
  return {
    name: STAGE_GIST_FILES,
    description:
      'Stage the extra files the project’s gist should carry when the person publishes it, beside the project file and README: ' +
      'an STL of the finished bodies a person would print (published as ASCII STL), and a note for print settings or assembly if one is needed. ' +
      `Replaces the staged list (the old names are returned as previous); [] clears it. At most ${maxFiles} files. ` +
      'A gist holds text files only, so there is no 3MF, binary STL or picture. Names that would replace README.md or the project file are refused. ' +
      'This never publishes: the person reviews the files in the Share sheet and taps Publish. Then call get_publish_readiness.',
    inputSchema: objectSchema({ files: { type: 'array', items: file, description: 'The files, in the order the gist lists them.' } }, ['files']),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      assertWriteOrigin(ctx.origin)
      const projectName = ctx.document.name()
      const prepared = prepareGistExtras(input.files, {
        projectName,
        projectFileName: gistFileName(projectName),
        bodyIds: new Set(ctx.document.bodies().map((body) => body.id)),
      })
      if (!prepared.ok) return { error: `Nothing was staged: ${prepared.reason}.`, reason: prepared.reason }
      const previous = ctx.document.gistExtras().map((extra) => extra.name)
      ctx.document.setGistExtras(prepared.extras, { origin: ctx.origin })
      return { staged: ctx.document.gistExtras().map(summarizeGistExtra), previous }
    },
  }
}

/** @returns {import('./index.js').Tool} */
export function createPublishReadinessTool() {
  return {
    name: GET_PUBLISH_READINESS,
    description:
      'Check what the project’s gist would contain if the person published it now, and what is still blank. Reads only; changes nothing. ' +
      'Returns { name, description, readme, files: [{ name, kind, approxBytes }], gaps }: the README the publish would write ' +
      '(with the prompts, which the person may still leave out), the staged extra files with their approximate sizes, and gaps — ' +
      'plain sentences such as a missing name or description, a variable with no min/max, or no reply recorded. Fix what it lists before you hand back.',
    inputSchema: objectSchema({}),
    transports: ['ai', 'mcp'],
    run: (ctx) => {
      assertWriteOrigin(ctx.origin)
      return { ...publishReadiness(ctx.document) }
    },
  }
}
