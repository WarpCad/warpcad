// Guards against the white-flash-on-load (FOUC) defect: index.html's <head> must
// paint the dark background and set color-scheme *before* any CSS/JS loads, since
// the whole point of TODO/build-002 is to close the race window between first paint
// and tokens.css finishing its fetch. This is a static markup check, not a browser
// screenshot, because a screenshot taken after page.goto resolves is taken well
// after the race window has already closed (see the TODO's own Testing section).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const indexHtml = readFileSync(`${repoRoot}index.html`, 'utf-8');
const tokensCss = readFileSync(`${repoRoot}src/styles/tokens.css`, 'utf-8');

describe('index.html first-paint background (TODO/build-002)', () => {
  it('reads the live --surface-0 value out of tokens.css, not a hardcoded expectation', () => {
    const match = tokensCss.match(/--surface-0:\s*(#[0-9a-fA-F]{3,8})\s*;/);
    expect(match).not.toBeNull();
  });

  it('has an inline <head> style painting html/body background to the current --surface-0 value', () => {
    const surfaceMatch = tokensCss.match(/--surface-0:\s*(#[0-9a-fA-F]{3,8})\s*;/);
    const surface0 = surfaceMatch[1];

    const headMatch = indexHtml.match(/<head>([\s\S]*?)<\/head>/i);
    expect(headMatch).not.toBeNull();
    const head = headMatch[1];

    const styleMatch = head.match(/<style>([\s\S]*?)<\/style>/i);
    expect(styleMatch).not.toBeNull();
    const styleBody = styleMatch[1];

    expect(styleBody).toMatch(/html\s*,\s*body\s*\{[^}]*\}/);
    const ruleMatch = styleBody.match(/html\s*,\s*body\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch[1]).toMatch(new RegExp(`background:\\s*${surface0}\\s*;`, 'i'));
  });

  it('has a <meta name="color-scheme" content="dark light"> tag in <head>', () => {
    const headMatch = indexHtml.match(/<head>([\s\S]*?)<\/head>/i);
    const head = headMatch[1];
    expect(head).toMatch(
      /<meta\s+name=["']color-scheme["']\s+content=["']dark light["']\s*\/?>/i,
    );
  });

  it('places the inline style before the main.js module script tag', () => {
    const styleIndex = indexHtml.search(/<style>/i);
    const scriptIndex = indexHtml.search(/<script[^>]*src=["']\/src\/main\.js["']/i);
    expect(styleIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(styleIndex).toBeLessThan(scriptIndex);
  });
});
