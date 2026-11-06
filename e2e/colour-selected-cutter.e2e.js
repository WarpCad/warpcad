// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

/**
 * `TODO/ui-098`: two overlapping translucent clearance cutters on a merged board. The owner
 * clicked the blue box, the Inspector said `USB clearance cutter` and `#ff0000`, and the box stayed
 * blue. The pick was right (the blue box *is* the USB cutter); the renderer was not: a hidden
 * part shown through **Show hidden parts** was drawn from its recipe colour alone, so a user
 * colour on it was recorded and never drawn.
 *
 * Driven against `/` with `e2e/fixtures/cutter-colour-selected.ndjson`, a copy of the owner's
 * project. **All three engines and viewports** (WebGL canvas, touch): two kinds of evidence, as in
 * `inspector-color-control.e2e.js`, the document's colour (`data-body-part-colors`) and the pixels
 * the renderer drew.
 */

const BATTERY = "Battery-Connector clearance cutter";
const USB = "USB clearance cutter";

/**
 * Open the fixture through File ▸ Open, with the File System Access picker off so the
 * file chooser fallback runs on every engine.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openFixture(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toHaveAttribute(
    "data-webgl",
    "ready",
  );
  await page.getByTestId("file-menu-button").click();
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByTestId("file-open").click();
  const chooser = await chooserEvent;
  const buffer = readFileSync(
    join(process.cwd(), "e2e/fixtures/cutter-colour-selected.ndjson"),
  );
  await chooser.setFiles({
    name: "cutters.ndjson",
    mimeType: "text/plain",
    buffer,
  });
  await expect(page.getByTestId("viewport")).toHaveAttribute(
    "data-body-count",
    "1",
  );
}

/**
 * The rendered canvas's pixels matching a predicate: where they are, as fractions of the canvas,
 * and how many.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} predicateSource `(r, g, b) => boolean`, as source (it runs in the page).
 * @param {'all' | 'left' | 'right'} [side] Only the left or right half of the matches, split
 *   midway between their extremes: two boxes of one colour side by side are told apart that way.
 * @returns {Promise<{ fx: number, fy: number, count: number, r: number, g: number, b: number }>}
 */
async function find(page, predicateSource, side = "all") {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return page.evaluate(
    ({ source, side }) => {
      const matches = new Function(`return ${source}`)();
      const canvas = /** @type {HTMLCanvasElement} */ (
        document.querySelector('[data-testid="viewport-canvas"]')
      );
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = /** @type {CanvasRenderingContext2D} */ (
        off.getContext("2d")
      );
      ctx.drawImage(canvas, 0, 0);
      const { data } = ctx.getImageData(0, 0, off.width, off.height);
      let minX = Infinity;
      let maxX = -Infinity;
      for (let y = 0; y < off.height; y += 2) {
        for (let x = 0; x < off.width; x += 2) {
          const i = (y * off.width + x) * 4;
          if (!matches(data[i], data[i + 1], data[i + 2])) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
      const split = (minX + maxX) / 2;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let y = 0; y < off.height; y += 2) {
        for (let x = 0; x < off.width; x += 2) {
          const i = (y * off.width + x) * 4;
          if (!matches(data[i], data[i + 1], data[i + 2])) continue;
          if (side === "left" && x > split) continue;
          if (side === "right" && x <= split) continue;
          count++;
          sx += x;
          sy += y;
          sr += data[i];
          sg += data[i + 1];
          sb += data[i + 2];
        }
      }
      const n = Math.max(count, 1);
      return {
        fx: sx / n / off.width,
        fy: sy / n / off.height,
        count,
        r: sr / n,
        g: sg / n,
        b: sb / n,
      };
    },
    { source: predicateSource, side },
  );
}

/** Steel-blue board, before anything is selected. */
const BOARD =
  "(r, g, b) => r > 60 && r < 125 && b > 140 && b < 210 && b - r > 50";
/** A translucent red cutter over white: pink. */
const PINK = "(r, g, b) => r > 215 && r - g > 50 && Math.abs(g - b) < 45";
/** A translucent green cutter over white: pale green. */
const PALE_GREEN = "(r, g, b) => g > 215 && g - r > 40 && g - b > 40";

/**
 * Click the canvas at fractions of its size with real pointer events.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function clickViewportAt(page, fx, fy) {
  await page.evaluate(
    ({ fx, fy }) => {
      const canvas = /** @type {HTMLElement} */ (
        document.querySelector('[data-testid="viewport-canvas"]')
      );
      const box = canvas.getBoundingClientRect();
      for (const type of ["pointerdown", "pointerup"]) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            clientX: box.left + box.width * fx,
            clientY: box.top + box.height * fy,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { fx, fy },
  );
  await page.waitForTimeout(120);
}

/**
 * Make the Inspector's contents reachable: nothing where it is a column, a tap on its tab on the phone.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  const inspector = page.getByTestId("inspector");
  const tab = page.getByTestId("inspector-tab");
  if (
    (await inspector.getAttribute("data-open")) !== "true" &&
    (await tab.isVisible())
  )
    await tab.click();
}

/**
 * Put a sheet-style Inspector away, so the canvas is what is looked at.
 *
 * @param {import('@playwright/test').Page} page
 */
async function hideInspector(page) {
  const tab = page.getByTestId("inspector-tab");
  if (
    (await tab.isVisible()) &&
    (await page.getByTestId("inspector").getAttribute("data-open")) === "true"
  )
    await tab.click();
}

test("a cutter clicked in the viewport is the one the Inspector names, and its colour is the one drawn", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openFixture(page);

  // Select the whole group by clicking the board, then show its hidden cutters.
  const board = await find(page, BOARD);
  expect(board.count, "the board is on the canvas").toBeGreaterThan(50);
  await clickViewportAt(page, board.fx, board.fy);
  await expect(page.getByTestId("viewport")).toHaveAttribute(
    "data-selected-count",
    "1",
  );
  await showInspector(page);
  await page.getByTestId("inspector-hidden-parts-toggle").check();
  await hideInspector(page);
  await clickViewportAt(page, 0.02, 0.02);
  await expect(page.getByTestId("viewport")).toHaveAttribute(
    "data-selected-count",
    "0",
  );

  // Two translucent boxes standing off the board's end, both red in the document: Battery
  // #ff000d (right) and USB #ff0000 (left, the owner's last pick). Both must be drawn red.
  const battery = await find(page, PINK, "right");
  const usb = await find(page, PINK, "left");
  expect(
    usb.count,
    "the USB cutter (#ff0000 in the document) is drawn red, not its recipe blue",
  ).toBeGreaterThan(30);
  expect(battery.count, "the Battery cutter is drawn red").toBeGreaterThan(30);
  expect(usb.fx, "USB is the left box").toBeLessThan(battery.fx);

  // Click the Battery box: the Inspector names it.
  await clickViewportAt(page, battery.fx, battery.fy); // whole group first…
  await clickViewportAt(page, battery.fx, battery.fy); // …then the part under the pointer
  await showInspector(page);
  await expect(page.getByTestId("inspector-name")).toHaveText(BATTERY);

  // Give it green.
  await page.getByTestId("inspector-color-input").fill("#00ff00");
  const bodyColors = await page
    .locator('[data-body-id="group-duolka-971"]')
    .getAttribute("data-body-part-colors");
  expect(bodyColors).toContain(`${BATTERY}=#00ff00`);
  expect(bodyColors, "the USB cutter keeps its own colour").toContain(
    `${USB}=#ff0000`,
  );
  await hideInspector(page);

  // The renderer drew it: the Battery box is green now, and nowhere is it still pink.
  await expect
    .poll(async () => (await find(page, PALE_GREEN)).count, {
      message: "a green cutter box is drawn",
    })
    .toBeGreaterThan(30);
  const green = await find(page, PALE_GREEN);
  expect(
    Math.abs(green.fx - battery.fx),
    "the green box sits where the Battery box was",
  ).toBeLessThan(0.08);
  const rest = await find(page, PINK);
  expect(
    Math.abs(rest.fx - usb.fx),
    "the red that is left is the USB box, untouched",
  ).toBeLessThan(0.05);
  expect(rest.count, "the USB box is as red as before").toBeGreaterThan(
    usb.count * 0.8,
  );
});
