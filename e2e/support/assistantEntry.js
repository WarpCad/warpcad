// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `TODO/ui-078` — the header's Assistant entry. On a phone with the live bridge available (the dev
 * host, or a spec that put the bridge in a non-`unavailable` state), the Assistant is a row of the
 * grouped **AI** menu, not a header button of its own. Everywhere else it is the header button.
 * This opens the menu when it has to and returns the `assistant-button` locator either way.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function revealAssistantButton(page) {
  const button = page.getByTestId('assistant-button')
  const trigger = page.getByTestId('ai-menu-button')
  // The header renders one or the other; wait for whichever it is before choosing.
  await button.or(trigger).waitFor({ state: 'visible' })
  if (!(await button.isVisible()) && (await trigger.isVisible())) await trigger.click()
  return button
}

/**
 * Click the Assistant entry, opening the grouped AI menu first when the header has one.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function clickAssistant(page) {
  const button = await revealAssistantButton(page)
  await button.click()
}
