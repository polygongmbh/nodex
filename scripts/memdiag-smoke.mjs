#!/usr/bin/env node
// Quick smoke test: open the dev server in headless Chromium without auth,
// wait briefly, and dump window.__nodex.memdiag.snapshot() once. Used to
// verify the in-app side of the harness without needing a real nsec/relays.
import { createConnection } from "node:net";
import { chromium } from "playwright";

function checkPort(port) {
  return new Promise((r) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.end(); r(true); });
    s.once("error", () => r(false));
  });
}

const PORT = 8080;
if (!(await checkPort(PORT))) {
  console.error("dev server not running on :8080 — start it with `npm run dev` first");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[nostr:memdiag]") || t.startsWith("[memdiag]")) console.log("[page]", t);
});
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });

// Wait up to 15s for memdiag to appear.
const deadline = Date.now() + 15_000;
let snap = null;
while (Date.now() < deadline) {
  snap = await page.evaluate(() => {
    const fn = (window).__nodex?.memdiag?.snapshot;
    return typeof fn === "function" ? fn() : null;
  });
  if (snap) break;
  await new Promise((r) => setTimeout(r, 500));
}

if (!snap) {
  console.error("FAIL: window.__nodex.memdiag.snapshot never appeared within 15s");
  await browser.close();
  process.exit(1);
}

const registered = await page.evaluate(() => (window).__nodex.memdiag.registered());
console.log("registered:", registered);
console.log("snapshot:", JSON.stringify(snap, null, 2));

await browser.close();
