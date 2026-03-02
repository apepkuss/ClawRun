import fs from 'fs';
import path from 'path';

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
const stored = (loadConfig().ollama ?? { endpoint: '' }) as { endpoint: string };
let endpoint = stored.endpoint;

export function setEndpoint(ep: string) {
  endpoint = ep.replace(/\/$/, '');
  saveConfig({ ollama: { endpoint } });
}

export function getEndpoint() {
  return endpoint;
}

export async function checkStatus(): Promise<boolean> {
  if (!endpoint) return false;
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<unknown> {
  const res = await fetch(`${endpoint}/api/tags`);
  if (!res.ok) throw new Error(`Ollama listModels failed: ${res.status}`);
  return res.json();
}

export async function pullModel(name: string): Promise<unknown> {
  const res = await fetch(`${endpoint}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama pull failed: ${res.status}`);
  return res.json();
}
