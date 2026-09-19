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
