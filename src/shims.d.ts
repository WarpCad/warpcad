// Vite resolves these imports at build time; `vue-tsc --noEmit` needs to be
// told they exist. `npm run typecheck` is a CI gate here (CLAUDE.md
// Conventions), so a missing shim is a failing build rather than a warning.
declare module '*.css'
