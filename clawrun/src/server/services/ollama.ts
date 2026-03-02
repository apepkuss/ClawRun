import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const CONFIG_FILE = '/app/data/config.json';

function loadConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(update: Record<string, unknown>) {
  const current = loadConfig();
  const merged = { ...current, ...update };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

// Runtime state (initialized from persisted config)
const stored = (loadConfig().ollama ?? { endpoint: '', uiUrl: '' }) as {
  endpoint: string;
  uiUrl?: string;
};
let endpoint = stored.endpoint;
let uiUrl = stored.uiUrl ?? '';

export function setConnection(ep: string, ui?: string) {
  endpoint = ep.replace(/\/$/, '');
  uiUrl = (ui ?? '').replace(/\/$/, '');
  saveConfig({ ollama: { endpoint, uiUrl } });
}

export function getConnection() {
  return { endpoint, uiUrl };
}

// wget helper: run a wget command and return { ok, body }
// Uses wget instead of fetch because Node.js undici is incompatible with Olares Envoy iptables.
function wget(url: string, opts?: { method?: string; body?: string }): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    let cmd: string;
    if (opts?.method === 'POST' && opts.body) {
      cmd = `wget -q -S -O - --header='Content-Type: application/json' --post-data='${opts.body.replace(/'/g, "'\\''")}' "${url}" 2>&1`;
    } else {
      cmd = `wget -q -S -O - "${url}" 2>&1`;
    }
    exec(cmd, { timeout: 30000 }, (_err, stdout) => {
      const ok = stdout.includes('HTTP/') && /HTTP\/\S+\s+2\d\d/.test(stdout);
      // Extract body: everything after the last blank line in wget -S output
      const parts = stdout.split('\n\n');
      const body = parts.length > 1 ? parts.slice(1).join('\n\n').trim() : stdout.trim();
      resolve({ ok, body });
    });
  });
}

// Health check via wget
export async function checkStatus(): Promise<boolean> {
  if (!endpoint) return false;
  const { ok } = await wget(`${endpoint}/api/tags`);
  return ok;
}

export async function listModels(): Promise<unknown> {
  const { ok, body } = await wget(`${endpoint}/api/tags`);
  if (!ok) throw new Error(`Ollama listModels failed`);
  return JSON.parse(body);
}

export async function pullModel(name: string): Promise<unknown> {
  const { ok, body } = await wget(`${endpoint}/api/pull`, {
    method: 'POST',
    body: JSON.stringify({ name, stream: false }),
  });
  if (!ok) throw new Error(`Ollama pull failed`);
  return JSON.parse(body);
}
