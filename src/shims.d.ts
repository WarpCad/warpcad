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

// `import.meta.env` is replaced by Vite at build time. Only the flags the app reads are
// declared (`DEV` gates the developer-only scripted provider, `TODO/ai-010`), rather than
// pulling in all of `vite/client`'s ambient types. `BASE_URL` is the deploy base the help
// loader prefixes (`TODO/ui-061`).
//
// `import.meta.hot` exists under `npm run dev` only (`undefined` in a build). The live bridge
// (`TODO/ai-012`, `composables/useLiveBridge.js`) uses just these three calls of it.
interface ImportMeta {
  readonly env: { readonly DEV: boolean; readonly PROD: boolean; readonly MODE: string; readonly BASE_URL: string }
  readonly hot?: {
    on(event: string, listener: (data: any) => void): void
    off(event: string, listener: (data: any) => void): void
    send(event: string, data?: any): void
  }
}
