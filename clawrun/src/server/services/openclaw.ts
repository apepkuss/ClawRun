import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const CONFIG_FILE = '/app/data/config.json';

interface Config {
  openclaw?: { endpoint: string; token: string; uiUrl?: string };
  ollama?: { endpoint: string };
}

function loadConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(update: Partial<Config>) {
  try {
    const current = loadConfig();
    const merged = { ...current, ...update };
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.error('[config] saveConfig failed:', err);
  }
}

// Runtime state (initialized from persisted config)
const stored = loadConfig().openclaw ?? { endpoint: '', token: '', uiUrl: '' };
let endpoint = stored.endpoint;
let token = stored.token;
let uiUrl = stored.uiUrl ?? '';

export function setConnection(ep: string, tk: string, ui?: string) {
  endpoint = ep.replace(/\/$/, '');
  token = tk;
  uiUrl = (ui ?? '').replace(/\/$/, '');
  saveConfig({ openclaw: { endpoint, token, uiUrl } });
}

export function getConnection() {
  return { endpoint, token, uiUrl };
}

// Health check via wget (undici/fetch is incompatible with Olares Envoy iptables).
// BusyBox wget (Alpine) exits 1 for both network errors and HTTP 4xx/5xx.
// Use -S to print response headers to stderr, redirect to stdout, check for "HTTP/".
export async function checkHealth(): Promise<boolean> {
  if (!endpoint) return false;
  return new Promise((resolve) => {
    const url = `${endpoint}/healthz`;
    exec(`wget -q -S --timeout=5 "${url}" -O /dev/null 2>&1`, { timeout: 6000 }, (_err, stdout) => {
      resolve(stdout.includes('HTTP/'));
    });
  });
}

export async function getConfig(): Promise<unknown> {
  const res = await fetch(`${endpoint}/api/config`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`OpenClaw config failed: ${res.status}`);
  return res.json();
}

export async function setConfig(key: string, value: string): Promise<unknown> {
  const res = await fetch(`${endpoint}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`OpenClaw setConfig failed: ${res.status}`);
  return res.json();
}
