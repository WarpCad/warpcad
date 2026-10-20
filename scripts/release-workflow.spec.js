// SPDX-License-Identifier: AGPL-3.0-or-later
// Guards the release path (TODO/build-013, docs/decisions/release.md): a merge to main deploys no
// Pages site; only a manually started Release run bumps, tags, writes notes and deploys.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pages = parse(read('.github/workflows/pages.yml'))
const release = parse(read('.github/workflows/release.yml'))
const releaseIt = JSON.parse(read('.release-it.json'))
const pkg = JSON.parse(read('package.json'))
// `on:` parses to the key "on" (YAML 1.2), so no `true` key surprise.
const triggers = (workflow) => Object.keys(workflow.on)

describe('pages.yml', () => {
  it('does not run on a merge, a push or a CI completion', () => {
    for (const trigger of ['workflow_run', 'push', 'pull_request']) expect(triggers(pages)).not.toContain(trigger)
  })

  it('runs only when called by the release or started by hand, each with a ref input', () => {
    expect(triggers(pages).sort()).toEqual(['workflow_call', 'workflow_dispatch'])
    expect(pages.on.workflow_call.inputs.ref).toBeDefined()
    expect(pages.on.workflow_dispatch.inputs.ref).toBeDefined()
  })

  it('builds the requested ref and reads the Sentry release from the checked-out commit', () => {
    const text = read('.github/workflows/pages.yml')
    const steps = pages.jobs.build.steps
    expect(steps.find((s) => s.uses?.startsWith('actions/checkout')).with.ref).toContain('inputs.ref')
    expect(text).not.toContain('workflow_run.head_sha')
    expect(text).not.toMatch(/SENTRY_RELEASE: \$\{\{ github\.sha/)
    expect(text).toContain('git rev-parse HEAD')
  })

  it('keeps the LFS cache and the single-deploy concurrency group', () => {
    expect(pages.jobs.build.steps.some((s) => s.uses === './.github/actions/lfs-media')).toBe(true)
    expect(pages.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false })
  })
})

describe('release.yml', () => {
  it('is started by hand only, with a bump choice', () => {
    expect(triggers(release)).toEqual(['workflow_dispatch'])
    expect(release.on.workflow_dispatch.inputs.bump.options).toEqual(['patch', 'minor', 'major'])
  })

  it('gives the release job contents: write and no other write permission', () => {
    const perms = release.jobs.release.permissions
    expect(perms.contents).toBe('write')
    expect(Object.entries(perms).filter(([, v]) => v === 'write').map(([k]) => k)).toEqual(['contents'])
  })

  it('runs ci.yml as a called workflow first, then release-it non-interactively', () => {
    const text = read('.github/workflows/release.yml')
    expect(release.jobs.test.uses).toBe('./.github/workflows/ci.yml')
    expect(release.jobs.release.needs).toBe('test')
    expect(text).toMatch(/release-it .*--ci/)
  })

  it('calls pages.yml on the new tag', () => {
    const deploy = Object.values(release.jobs).find((j) => j.uses === './.github/workflows/pages.yml')
    expect(deploy).toBeDefined()
    expect(deploy.with.ref).toBeTruthy()
    expect(deploy.needs).toBe('release')
    expect(deploy.permissions).toMatchObject({ pages: 'write', 'id-token': 'write' })
  })
})

describe('ci.yml (TODO/build-014)', () => {
  const ci = parse(read('.github/workflows/ci.yml'))

  it('never starts on a push or a pull request, so no hosted minutes are spent unasked', () => {
    for (const trigger of ['push', 'pull_request', 'pull_request_target', 'schedule']) expect(triggers(ci)).not.toContain(trigger)
    expect(triggers(ci).sort()).toEqual(['workflow_call', 'workflow_dispatch'])
  })

  it('has no other workflow that starts on a push', () => {
    for (const f of ['pages.yml', 'release.yml']) expect(triggers(parse(read(`.github/workflows/${f}`)))).not.toContain('push')
  })
})

describe('pre-push gate (TODO/build-014)', () => {
  it('installs .githooks and gives the hook all four git-lfs stubs', () => {
    expect(pkg.scripts.prepare).toContain('core.hooksPath .githooks')
    for (const h of ['pre-push', 'post-commit', 'post-checkout', 'post-merge']) expect(read(`.githooks/${h}`)).toContain('git lfs')
  })

  it('feeds the refs to both git lfs pre-push and the check, LFS first', () => {
    const hook = read('.githooks/pre-push')
    expect(hook.indexOf('git lfs pre-push')).toBeGreaterThan(-1)
    expect(hook.indexOf('git lfs pre-push')).toBeLessThan(hook.indexOf('stamp verify-push'))
    expect(hook).toMatch(/refs="\$\(cat\)"/)
  })
})

describe('.release-it.json', () => {
  it('cannot publish to npm or tag a branch other than main', () => {
    expect(releaseIt.npm.publish).toBe(false)
    expect(releaseIt.git.requireBranch).toBe('main')
    expect(releaseIt.git.requireCleanWorkingDir).toBe(true)
    expect(releaseIt.github.release).toBe(true)
    expect(releaseIt.git.tagName).toBe('v${version}')
  })

  it('has the release-it packages pinned and a release script', () => {
    expect(pkg.devDependencies['release-it']).toMatch(/^\d/)
    expect(pkg.devDependencies['@release-it/conventional-changelog']).toMatch(/^\d/)
    expect(pkg.scripts.release).toContain('release-it')
  })

  it('does not pin the licence check to one app version, so a bump cannot break CI', () => {
    expect(pkg.scripts.licenses).not.toMatch(/warpcad@\d/)
  })
})
