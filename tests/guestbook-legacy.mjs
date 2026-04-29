// Regression test: legacy guestbook payloads in localStorage must render
// safely under the new textContent-based renderer.
//
// The old renderer used innerHTML with a naive replace(/[<>&"']/g, '') strip.
// localStorage may still hold the raw author input (e.g. with `<`, `&`, `'`),
// because sanitization happened at render time, not at write time. The new
// renderer uses textContent and must (a) not throw, (b) display the literal
// characters, (c) not execute any markup found in stored notes.
//
// Run with: node tests/guestbook-legacy.mjs   (Astro preview server must be running)

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321/wedding';
const KEY = 'wedding-guestbook-v1';

const legacyNotes = [
  // Plain text — control case.
  {
    id: 'legacy-1', name: 'Иван', text: 'Поздравляем!',
    color: 'cream', rot: -2, t: 1,
  },
  // Author typed angle brackets and ampersands. Old code would strip these,
  // localStorage kept them. New code must render them literally.
  {
    id: 'legacy-2', name: 'Tom & Jerry', text: 'love < life > everything',
    color: 'blush', rot: 3, t: 2,
  },
  // Author tried to inject markup. Must NOT execute and MUST appear as text.
  {
    id: 'legacy-3', name: '<img src=x onerror=window.__pwn=1>',
    text: '<script>window.__pwn=1</script><b>bold</b>',
    color: 'moss', rot: 0, t: 3,
  },
  // Quotes and apostrophes — common in real names ("Don't", "she's").
  {
    id: 'legacy-4', name: "O'Brien", text: 'don\'t worry, "be happy"',
    color: 'gold', rot: -1, t: 4,
  },
];

const corruptPayloads = [
  '{not valid json',
  'null',
  '"a string"',
  '{"id":"x"}', // single object, not an array — load() returns whatever JSON.parse gives, render iterates with forEach so non-array would throw
];

const errors = [];
const fail = (msg) => { errors.push(msg); console.error('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

async function check(label, setup) {
  console.log(`\n[${label}]`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
  });

  // Pre-seed localStorage BEFORE the page script runs.
  await page.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch {}
    // Tripwire: if any injected markup actually executes, this gets set.
    Object.defineProperty(window, '__pwn', {
      get() { return window.__pwn_val; },
      set(v) { window.__pwn_val = v; window.__pwn_called = true; },
    });
  }, [KEY, setup]);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // Scroll guestbook into view so the IntersectionObserver-driven reveal kicks in.
  await page.locator('#guestbook').scrollIntoViewIfNeeded();
  // Give the inline script a tick to render.
  await page.waitForTimeout(200);

  if (consoleErrors.length) {
    fail(`page produced errors: ${consoleErrors.join(' | ')}`);
  } else {
    ok('no console / page errors');
  }

  const pwnFired = await page.evaluate(() => window.__pwn_called === true);
  if (pwnFired) fail('injected markup executed (window.__pwn was set)');
  else ok('no injected markup executed');

  const result = { browser, page, consoleErrors };
  return result;
}

async function main() {
  // ── Case 1: legacy real-world payloads ──────────────────────────────
  const c1 = await check('legacy notes (with <>&\'", scripts, img onerror)', JSON.stringify(legacyNotes));
  const renderedTexts = await c1.page.$$eval('#gb-notes .gb-note-text', (els) =>
    els.map((el) => el.textContent),
  );
  const renderedNames = await c1.page.$$eval('#gb-notes .gb-note-name', (els) =>
    els.map((el) => el.textContent),
  );

  if (renderedTexts.length !== legacyNotes.length) {
    fail(`expected ${legacyNotes.length} notes, got ${renderedTexts.length}`);
  } else {
    ok(`rendered all ${legacyNotes.length} notes`);
  }

  for (const note of legacyNotes) {
    if (!renderedTexts.some((t) => t === note.text)) {
      fail(`text not rendered literally: ${JSON.stringify(note.text)}`);
    }
    const expectedName = `— ${note.name}`;
    if (!renderedNames.some((n) => n === expectedName)) {
      fail(`name not rendered literally: ${JSON.stringify(note.name)}`);
    }
  }
  ok('every legacy note rendered as literal text via textContent');

  // Confirm the markup didn't actually become DOM (no <img>, no <script>, no <b>).
  const injectedNodes = await c1.page.$$eval('#gb-notes', (boards) => {
    const root = boards[0];
    return {
      img: root.querySelectorAll('img').length,
      script: root.querySelectorAll('script').length,
      b: root.querySelectorAll('b').length,
    };
  });
  if (injectedNodes.img + injectedNodes.script + injectedNodes.b !== 0) {
    fail(`injected DOM appeared: ${JSON.stringify(injectedNodes)}`);
  } else {
    ok('no injected <img>/<script>/<b> nodes inside #gb-notes');
  }
  await c1.browser.close();

  // ── Case 2: corrupt JSON payloads must not break the page ───────────
  for (const payload of corruptPayloads) {
    const c = await check(`corrupt payload: ${payload}`, payload);
    // Form should still be functional — adding a new note should work.
    const formExists = await c.page.locator('#gb-form').count();
    if (formExists !== 1) fail('form did not render');
    else ok('form still renders despite corrupt localStorage');
    await c.browser.close();
  }

  if (errors.length) {
    console.error(`\nFAILED: ${errors.length} assertion(s)`);
    process.exit(1);
  }
  console.log('\nAll guestbook legacy assertions passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
