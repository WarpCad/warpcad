// SPDX-License-Identifier: AGPL-3.0-or-later
// Vite resolves these imports at build time; `vue-tsc --noEmit` needs to be
// told they exist. `npm run typecheck` is a CI gate here (CLAUDE.md
// Conventions), so a missing shim is a failing build rather than a warning.
declare module '*.css'

// The two JSCAD serializers are plain CommonJS with no bundled types
// (`TODO/io-003`). Only `serialize` is used; its chunks are an `ArrayBuffer` for
// binary STL and a string for OBJ.
declare module '@jscad/stl-serializer' {
  const serializer: {
    mimeType: string
    serialize(options: { binary?: boolean }, ...objects: any[]): Array<ArrayBuffer | string>
  }
  export default serializer
}
declare module '@jscad/obj-serializer' {
  const serializer: {
    mimeType: string
    serialize(options: { triangulate?: boolean }, ...objects: any[]): Array<ArrayBuffer | string>
  }
  export default serializer
}

// Vite's `?raw` suffix imports a file's text verbatim. Only specs use it: a spec that
// diffs against V1 source reads that source through Vite, which already resolves it,
// rather than needing Node's `fs` types (`TODO/core-026`, `colors.spec.js`).
declare module '*?raw' {
  const source: string
  export default source
}
