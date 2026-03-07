import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
const CONFIG_FILE = '/app/data/config.json';

// Derive Olares username from OS_SYSTEM_SERVER env var
function getUsername(): string {
  const systemServer = process.env.OS_SYSTEM_SERVER ?? '';
  return systemServer.split('user-system-')[1] ?? 'unknown';
}

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

export type OllamaVariant = 'cpu' | 'gpu' | null;

// Runtime state (initialized from persisted config)
const stored = (loadConfig().ollama ?? { endpoint: '', uiUrl: '', variant: null }) as {
  endpoint: string;
  uiUrl?: string;
  variant?: OllamaVariant;
};
let endpoint = stored.endpoint;
let uiUrl = stored.uiUrl ?? '';
let variant: OllamaVariant = stored.variant ?? null;

function persist() {
  saveConfig({ ollama: { endpoint, uiUrl, variant } });
}

export function setConnection(ep: string, ui?: string) {
  endpoint = ep.replace(/\/$/, '');
  uiUrl = (ui ?? '').replace(/\/$/, '');
  persist();
}

export function setVariant(v: OllamaVariant) {
  variant = v;
  persist();
}

export function getConnection() {
  return { endpoint, uiUrl, variant };
}

// Auto-detect external UI URL from Olares URL pattern.
export function autoConfigureUiUrl(baseDomain: string, v: OllamaVariant): void {
  if (!v || !baseDomain) return;

  const appName = v === 'cpu' ? 'ollamarun' : 'ollama';
  const appId = crypto.createHash('md5').update(appName).digest('hex').substring(0, 8);
  const expected = `https://${appId}.${baseDomain}`;
  if (uiUrl === expected) return;

  uiUrl = expected;
  persist();
  console.log(`[ollama] auto-configured uiUrl: ${expected}`);
}

// --- Auto-detect and health check ---

function checkDeployReady(namespace: string, deployment: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      `kubectl get deploy/${deployment} -n ${namespace} -o jsonpath='{.status.readyReplicas}'`,
      { timeout: 10000 },
      (_err: unknown, stdout: string) => {
        const ready = parseInt(stdout.replace(/'/g, ''), 10);
        resolve(ready > 0);
      },
    );
  });
}

export async function checkStatus(): Promise<boolean> {
  const user = getUsername();

  // If variant is already known, check directly
  if (variant) {
    const ns = variant === 'cpu' ? `ollamarun-${user}` : `ollama-${user}`;
    const deploy = variant === 'cpu' ? 'ollamarun' : 'ollama';
    return checkDeployReady(ns, deploy);
  }

  // Auto-detect: try both variants
  const candidates: { v: OllamaVariant; ns: string; deploy: string; svc: string; port: number }[] = [
    { v: 'cpu', ns: `ollamarun-${user}`, deploy: 'ollamarun', svc: 'ollamarun-svc', port: 11434 },
    { v: 'gpu', ns: `ollama-${user}`, deploy: 'ollama', svc: 'ollama-svc', port: 11434 },
  ];

  for (const c of candidates) {
    const ready = await checkDeployReady(c.ns, c.deploy);
    if (ready) {
      // Auto-configure variant and endpoint
      variant = c.v;
      endpoint = `http://${c.svc}.${c.ns}:${c.port}`;
      persist();
      console.log(`[ollama] auto-detected: variant=${c.v}, endpoint=${endpoint}`);
      return true;
    }
  }

  return false;
}
