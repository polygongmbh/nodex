#!/usr/bin/env node
// Just load / and measure heap once it stabilises.
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
  dev = spawn("npm", ["run", "dev"], { stdio: ["ignore", "pipe", "pipe"] });
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
  } catch (e) {}
`);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => { errors.push(e.message); console.log("[pageerror]", e.message); });
page.on("console", (m) => { if (m.type() === "error") { errors.push(m.text()); } });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 15000));

const snap = await page.evaluate(() => {
  const fn = (window).__nodex?.memdiag?.snapshot;
  return typeof fn === "function" ? fn() : null;
});

console.log("heap:", snap?.jsHeap);
console.log("posts:", snap?.stores.posts?.size, "raw-events:", snap?.stores["raw-events"]?.size);
console.log("errors:", errors.length);

await browser.close();
if (dev) dev.kill("SIGTERM");
