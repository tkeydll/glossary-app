// Basic E2E test using Playwright
// Spawns API (Cosmos/memory) and static server, then interacts with UI to add a term.
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');

let apiProc; let feProc;
const ROOT = path.resolve(__dirname, '..');

async function startApi() {
  const envBase = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' };
  apiProc = spawn(process.execPath, ['cosmos-api-server.js'], { cwd: ROOT, env: envBase, stdio: 'pipe' });
  await waitForLog(apiProc, /Glossary API server .*mode=/, 15000);
}

async function startFrontend() {
  feProc = spawn('npx', ['http-server', '.', '-p', '8080', '-c-1', '--cors'], { cwd: ROOT, env: process.env, stdio: 'pipe' });
  await waitForLog(feProc, /Available on:/, 10000);
}

test.beforeAll(async () => {
  await startApi();
  await startFrontend();
});

test.afterAll(async () => {
  for (const p of [feProc, apiProc]) if (p && !p.killed) p.kill();
});

test('add term via UI and verify appears', async ({ page }) => {
  const unique = 'E2E-' + Date.now();
  await page.goto('http://localhost:8080');
  await page.waitForSelector('#termInput');
  await page.fill('#termInput', unique);
  await page.click('#addTermForm button[type="submit"]');
  // Wait for card to appear
  await expect(page.locator('.term-card .term-name', { hasText: unique })).toBeVisible({ timeout: 8000 });
  // Search flow
  await page.fill('#searchInput', unique.slice(0, 4));
  await expect(page.locator('.term-card .term-name', { hasText: unique })).toBeVisible();
});

function waitForLog(proc, regex, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout waiting for log ' + regex)); }, timeout);
    function onData(d){ if (regex.test(d.toString())) { cleanup(); resolve(); } }
    function onErr(d){ if (regex.test(d.toString())) { cleanup(); resolve(); } }
    function cleanup(){ clearTimeout(timer); proc.stdout?.off('data', onData); proc.stderr?.off('data', onErr); }
    proc.stdout?.on('data', onData); proc.stderr?.on('data', onErr);
  });
}
