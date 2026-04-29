// LCP / CLS / TTFB measurement against the production preview build.
//
// Run with: node tests/perf.mjs   (Astro preview server must be running)
//
// Uses PerformanceObserver inside the page to capture web-vitals-style
// metrics, then prints a table. Optional thresholds via CLI:
//   node tests/perf.mjs --max-lcp=2500 --max-cls=0.1

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321/wedding';
const PAGES = ['/', '/full', '/wedding-only'];

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);
const maxLcp = args['max-lcp'] ? Number(args['max-lcp']) : null;
const maxCls = args['max-cls'] ? Number(args['max-cls']) : null;

async function measure(page, url) {
  // Install observers BEFORE any page activity so we don't miss the first paint.
  await page.addInitScript(() => {
    window.__metrics = { lcp: 0, cls: 0, fcp: 0, ttfb: 0 };
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last && last.startTime > window.__metrics.lcp) {
        window.__metrics.lcp = last.startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__metrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          window.__metrics.fcp = entry.startTime;
        }
      }
    }).observe({ type: 'paint', buffered: true });
  });

  const t0 = Date.now();
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  const navMs = Date.now() - t0;

  // Settle the page so late-arriving CLS (font swap, image load) is captured.
  await page.waitForTimeout(2500);

  // Trigger a small scroll to fire any deferred paint, then read metrics.
  await page.evaluate(() => window.scrollBy(0, 1));
  await page.waitForTimeout(200);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      lcp: window.__metrics.lcp,
      cls: window.__metrics.cls,
      fcp: window.__metrics.fcp,
      ttfb: nav ? nav.responseStart - nav.startTime : 0,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
      transferKb: nav ? Math.round((nav.transferSize || 0) / 102.4) / 10 : 0,
    };
  });

  return {
    url,
    status: response?.status() ?? 0,
    navMs,
    ...metrics,
  };
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const results = [];
  for (const path of PAGES) {
    const page = await context.newPage();
    try {
      const r = await measure(page, BASE + path);
      results.push(r);
    } finally {
      await page.close();
    }
  }
  await browser.close();

  console.log('');
  console.log('PATH                  STATUS   LCP(ms)   FCP(ms)   CLS      TTFB(ms)  TRANSFER(kb)');
  console.log('────────────────────  ──────   ────────  ────────  ───────  ────────  ────────────');
  for (const r of results) {
    const path = r.url.replace(BASE, '') || '/';
    console.log(
      [
        path.padEnd(20),
        String(r.status).padStart(6),
        Math.round(r.lcp).toString().padStart(8),
        Math.round(r.fcp).toString().padStart(10),
        r.cls.toFixed(4).padStart(9),
        Math.round(r.ttfb).toString().padStart(10),
        r.transferKb.toFixed(1).padStart(13),
      ].join('  '),
    );
  }
  console.log('');

  let failed = false;
  for (const r of results) {
    if (maxLcp != null && r.lcp > maxLcp) {
      console.error(`✗ ${r.url}: LCP ${Math.round(r.lcp)}ms exceeds threshold ${maxLcp}ms`);
      failed = true;
    }
    if (maxCls != null && r.cls > maxCls) {
      console.error(`✗ ${r.url}: CLS ${r.cls.toFixed(4)} exceeds threshold ${maxCls}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
