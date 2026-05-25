#!/usr/bin/env node
// Quick debug probe: load the app with the user's auth seeded, navigate to
// each view, watch for console errors / pageerrors. Writes a brief summary.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 8080;
const cfg = JSON.parse(readFileSync(".memdiag-config.json", "utf8"));

function checkPort(port) {
  return new Promise((r) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.end(); r(true); });
    s.once("error", () => r(false));
  });
}

let dev = null;
if (!(await checkPort(PORT))) {
  console.log("starting dev server…");
  dev = spawn("npm", ["run", "dev"], { stdio: ["ignore", "pipe", "pipe"] });
  dev.stdout.on("data", (b) => process.stdout.write(`[dev] ${b}`));
  dev.stderr.on("data", (b) => process.stderr.write(`[dev!] ${b}`));
  while (!(await checkPort(PORT))) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addInitScript(`
  try {
    localStorage.setItem("nostr_relays", ${JSON.stringify(JSON.stringify(cfg.relays))});
    localStorage.setItem("nostr_guest_nsec", ${JSON.stringify(cfg.nsec)});
    sessionStorage.setItem("nostr_auth_method", "privateKey");
    sessionStorage.setItem("nostr_session_private_key", ${JSON.stringify(cfg.nsec)});
  } catch (e) { console.error("seed failed", e); }
`);
const page = await ctx.newPage();

const errors = [];
const warnings = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (msg.type() === "error") {
    errors.push(t);
    console.log("[err]", t.slice(0, 200));
  } else if (msg.type() === "warning") {
    warnings.push(t);
  }
});
page.on("pageerror", (err) => {
  errors.push("PAGEERROR: " + err.message);
  console.log("[pageerror]", err.message);
});

console.log("\nGOTO /");
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 8000));

console.log("\nGOTO /kanban");
await page.goto(`http://localhost:${PORT}/kanban`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 5000));

console.log("\nGOTO /calendar");
await page.goto(`http://localhost:${PORT}/calendar`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 4000));

console.log("\nGOTO /list");
await page.goto(`http://localhost:${PORT}/list`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 4000));

console.log("\nGOTO /tree");
await page.goto(`http://localhost:${PORT}/tree`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 4000));

const finalSnap = await page.evaluate(() => {
  const fn = (window).__nodex?.memdiag?.snapshot;
  return typeof fn === "function" ? fn() : null;
});

console.log("\n=== FINAL SNAPSHOT ===");
console.log(JSON.stringify(finalSnap, null, 2));
console.log(`\n${errors.length} errors, ${warnings.length} warnings`);

await browser.close();
if (dev) dev.kill("SIGTERM");
