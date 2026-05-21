#!/usr/bin/env node
/**
 * Memory diagnostic harness. Drives the dev server in headless Chromium,
 * polls window.__nodex.memdiag.snapshot() across a session, and writes a
 * JSON timeline + summary so the leak can be diagnosed without manual heap
 * snapshots.
 *
 * Usage:
 *   cp .memdiag-config.example.json .memdiag-config.json   (then edit)
 *   npm run memdiag
 */

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, ".memdiag-config.json");
const RUNS_DIR = resolve(ROOT, "memdiag-runs");
const PORT = 8080;
const DEV_HOST = `http://localhost:${PORT}/`;
const READY_TIMEOUT_MS = 60_000;
const BACKFILL_QUIESCE_WINDOW_MS = 5_000;
const BACKFILL_HARD_CEILING_MS = 60_000;

async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Missing ${CONFIG_PATH}. Copy .memdiag-config.example.json to .memdiag-config.json and edit.`);
    process.exit(2);
  }
  const raw = await readFile(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.nsec || typeof cfg.nsec !== "string") throw new Error("config.nsec missing");
  if (!Array.isArray(cfg.relays) || cfg.relays.length === 0) throw new Error("config.relays missing");
  cfg.durationSec = Number(cfg.durationSec) || 180;
  cfg.sampleEverySec = Number(cfg.sampleEverySec) || 10;
  return cfg;
}

function isPortListening(port) {
  return new Promise((resolveCheck) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.end(); resolveCheck(true); });
    socket.once("error", () => resolveCheck(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function ensureDevServer() {
  if (await isPortListening(PORT)) {
    console.log(`[memdiag] dev server already running on :${PORT}`);
    return null;
  }
  console.log("[memdiag] starting dev server (npm run dev)…");
  const child = spawn("npm", ["run", "dev"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (b) => process.stdout.write(`[dev] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[dev!] ${b}`));
  const ready = await waitForPort(PORT, READY_TIMEOUT_MS);
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error(`Dev server did not become ready on :${PORT} within ${READY_TIMEOUT_MS}ms`);
  }
  return child;
}

function seedStorageScript(cfg) {
  const relays = JSON.stringify(cfg.relays);
  const nsec = JSON.stringify(cfg.nsec);
  // Mirrors src/infrastructure/nostr/provider/storage.ts:
  //   STORAGE_KEY_AUTH = "nostr_auth_method"
  //   STORAGE_KEY_NSEC = "nostr_guest_nsec"
  //   STORAGE_KEY_RELAYS = "nostr_relays"
  //   STORAGE_KEY_SESSION_PRIVATE_KEY = "nostr_session_private_key"
  // privateKey auth lives in sessionStorage; the guest nsec key also writes
  // to localStorage. Seed both so whichever path the provider takes finds it.
  return `
    try {
      localStorage.setItem("nostr_relays", ${JSON.stringify(relays)});
      localStorage.setItem("nostr_guest_nsec", ${nsec});
      sessionStorage.setItem("nostr_auth_method", "privateKey");
      sessionStorage.setItem("nostr_session_private_key", ${nsec});
    } catch (err) { console.error("memdiag seed failed", err); }
  `;
}

async function pollSnapshot(page) {
  return page.evaluate(() => {
    const fn = (window).__nodex && (window).__nodex.memdiag && (window).__nodex.memdiag.snapshot;
    return typeof fn === "function" ? fn() : null;
  });
}

async function waitForMemdiag(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await pollSnapshot(page);
    if (snap) return snap;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("window.__nodex.memdiag never appeared — is DEV mode on and any store registered?");
}

async function waitForBackfillQuiescence(page) {
  const start = Date.now();
  let lastTotal = -1;
  let steadySince = 0;
  let lastSnap = null;
  while (Date.now() - start < BACKFILL_HARD_CEILING_MS) {
    const snap = await pollSnapshot(page);
    if (!snap) { await new Promise((r) => setTimeout(r, 500)); continue; }
    lastSnap = snap;
    const total = snap.stores["event-router"]?.extras?.eventsIngestedTotal ?? 0;
    if (total === lastTotal) {
      if (steadySince === 0) steadySince = Date.now();
      if (Date.now() - steadySince >= BACKFILL_QUIESCE_WINDOW_MS) {
        return snap;
      }
    } else {
      lastTotal = total;
      steadySince = 0;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn(`[memdiag] backfill did not quiesce within ${BACKFILL_HARD_CEILING_MS}ms — proceeding`);
  return lastSnap ?? (await pollSnapshot(page));
}

function summarize(baseline, timeline) {
  const summary = {};
  const labels = new Set();
  for (const t of timeline) for (const k of Object.keys(t.stores)) labels.add(k);
  for (const label of labels) {
    const bSize = baseline?.stores?.[label]?.size ?? 0;
    const sizes = timeline.map((t) => t.stores[label]?.size ?? 0);
    const last = sizes[sizes.length - 1] ?? bSize;
    const max = sizes.reduce((m, v) => (v > m ? v : m), bSize);
    // Linear regression slope (size per second) across timeline.
    const xs = timeline.map((t) => (t.ts - timeline[0].ts) / 1000);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = sizes.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (sizes[i] - my); den += (xs[i] - mx) ** 2; }
    const slope = den === 0 ? 0 : num / den;
    summary[label] = { baseline: bSize, final: last, max, deltaFromBaseline: last - bSize, growthPerSec: Number(slope.toFixed(3)) };
  }
  return summary;
}

function printTable(summary, heapBaseline, heapFinal) {
  const rows = Object.entries(summary)
    .map(([label, s]) => ({ label, ...s }))
    .sort((a, b) => b.deltaFromBaseline - a.deltaFromBaseline);
  const headers = ["label", "baseline", "final", "max", "Δ", "g/s"];
  const lines = [headers.join("\t")];
  for (const r of rows) {
    lines.push([r.label, r.baseline, r.final, r.max, r.deltaFromBaseline, r.growthPerSec].join("\t"));
  }
  console.log("\n[memdiag] summary (sorted by Δ baseline→final):\n" + lines.join("\n"));
  if (heapBaseline && heapFinal) {
    console.log(`[memdiag] jsHeap used: ${heapBaseline.usedMB}MB → ${heapFinal.usedMB}MB (Δ ${(heapFinal.usedMB - heapBaseline.usedMB).toFixed(2)}MB)`);
  }
}

async function main() {
  const cfg = await loadConfig();
  await mkdir(RUNS_DIR, { recursive: true });

  const devChild = await ensureDevServer();
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("playwright not installed. Run: npm i -D playwright && npx playwright install chromium");
    if (devChild) devChild.kill("SIGTERM");
    process.exit(3);
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await ctx.addInitScript(seedStorageScript(cfg));
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("[nostr:memdiag]") || text.startsWith("[memdiag]")) {
      console.log(`[page] ${text}`);
    }
  });
  page.on("pageerror", (err) => console.error("[page!]", err.message));

  console.log(`[memdiag] navigating to ${DEV_HOST}`);
  await page.goto(DEV_HOST, { waitUntil: "domcontentloaded" });

  console.log("[memdiag] waiting for window.__nodex.memdiag …");
  await waitForMemdiag(page, 30_000);

  console.log("[memdiag] waiting for backfill quiescence …");
  const baseline = await waitForBackfillQuiescence(page);
  console.log(`[memdiag] baseline captured at t+${Math.round((baseline?.uptimeMs ?? 0) / 1000)}s`);

  const ticks = Math.max(1, Math.floor(cfg.durationSec / cfg.sampleEverySec));
  const timeline = [];
  for (let i = 0; i < ticks; i++) {
    await new Promise((r) => setTimeout(r, cfg.sampleEverySec * 1000));
    const snap = await pollSnapshot(page);
    if (snap) {
      timeline.push(snap);
      console.log(`[memdiag] tick ${i + 1}/${ticks}  jsHeap=${snap.jsHeap?.usedMB ?? "?"}MB`);
    }
  }

  const summary = timeline.length > 0 ? summarize(baseline, timeline) : {};
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(RUNS_DIR, `${stamp}.json`);
  const payload = {
    config: { relays: cfg.relays, durationSec: cfg.durationSec, sampleEverySec: cfg.sampleEverySec },
    baseline,
    timeline,
    summary,
  };
  await writeFile(outPath, JSON.stringify(payload, null, 2));
  console.log(`[memdiag] wrote ${outPath}`);

  printTable(
    summary,
    baseline?.jsHeap ?? null,
    timeline[timeline.length - 1]?.jsHeap ?? null,
  );

  await browser.close();
  if (devChild) {
    console.log("[memdiag] stopping dev server …");
    devChild.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
