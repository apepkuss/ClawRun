import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { getDeploymentEnvVar, getDeploymentEnvVars, patchDeploymentEnvVarsBoth } from './k8s';

const CONFIG_FILE = '/app/data/config.json';

interface Config {
  openclaw?: { endpoint: string; token: string; uiUrl?: string };
  ollama?: { endpoint: string };
  wizardCompleted?: boolean;
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

// Use wget instead of curl/fetch — both Node.js fetch (undici) and curl are
// incompatible with Olares Envoy iptables interception for cross-namespace calls.
export async function getConfig(): Promise<unknown> {
  if (!endpoint) throw new Error('OpenClaw endpoint not configured');
  return new Promise((resolve, reject) => {
    const url = `${endpoint}/api/config`;
    exec(
      `wget -q -O - --header="Authorization: Bearer ${token}" --timeout=10 "${url}"`,
      { timeout: 12000 },
      (err, stdout) => {
        if (err) return reject(new Error(`OpenClaw getConfig failed: ${err.message}`));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`OpenClaw getConfig: invalid JSON response`));
        }
      },
    );
  });
}

export async function setConfig(key: string, value: unknown): Promise<unknown> {
  if (!endpoint) throw new Error('OpenClaw endpoint not configured');
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ key, value });
    const url = `${endpoint}/api/config`;
    // Write payload to temp file to avoid shell quoting issues, then POST via wget
    const tmpFile = `/tmp/openclaw-post-${Date.now()}.json`;
    exec(
      `printf '%s' '${payload.replace(/'/g, "'\\''")}' > ${tmpFile} && wget -q -O - --header="Authorization: Bearer ${token}" --header="Content-Type: application/json" --post-file=${tmpFile} --timeout=10 "${url}"; rm -f ${tmpFile}`,
      { timeout: 12000 },
      (err, stdout) => {
        if (err) return reject(new Error(`OpenClaw setConfig failed: ${err.message}`));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ ok: true });
        }
      },
    );
  });
}

// Sync OPENCLAW_GATEWAY_TOKEN from the OpenClaw Deployment.
// Always verifies the stored token matches K8s — handles reinstalls and env patches.
let lastTokenSync = 0;
const TOKEN_SYNC_INTERVAL = 5 * 60 * 1000; // re-verify every 5 min

export async function autoConfigureToken(username: string): Promise<void> {
  // Skip if recently verified and token exists
  if (token && Date.now() - lastTokenSync < TOKEN_SYNC_INTERVAL) return;

  const ns = `openclaw-${username}`;
  const tk = await getDeploymentEnvVar(ns, 'openclaw', 'OPENCLAW_GATEWAY_TOKEN');
  if (!tk) return;

  lastTokenSync = Date.now();
  if (tk === token) return; // already correct

  const ep = endpoint || `http://openclaw-svc.${ns}:18789`;
  setConnection(ep, tk);
  console.log(`[openclaw] synced token from K8s deployment (ns=${ns})`);
}

// Auto-detect external UI URL from Olares URL pattern.
// Olares: single entrance = https://{appId}.{zone}, multi = https://{appId}{index}.{zone}
export function autoConfigureUiUrl(baseDomain: string): void {
  if (!baseDomain) return;

  // OpenClaw has 1 entrance → no index suffix
  const appId = crypto.createHash('md5').update('openclaw').digest('hex').substring(0, 8);
  const expected = `https://${appId}.${baseDomain}`;
  if (uiUrl === expected) return; // already correct

  setConnection(endpoint, token, expected);
  console.log(`[openclaw] auto-configured uiUrl: ${expected}`);
}

// Read which API key env vars are configured on the OpenClaw Deployment.
// Returns list of non-empty env var names (values are NOT exposed).
export async function getApiKeyStatus(username: string): Promise<string[]> {
  const ns = `openclaw-${username}`;
  const envs = await getDeploymentEnvVars(ns, 'openclaw', 'openclaw');
  if (!envs) return [];
  return Object.keys(envs).filter((k) => envs[k].length > 0);
}

// Patch API key env vars on the OpenClaw Deployment via K8s strategic merge patch.
// Triggers a pod restart so the new env vars take effect.
export async function setApiKeys(username: string, keys: Record<string, string>): Promise<boolean> {
  const ns = `openclaw-${username}`;
  // Patch BOTH the main container AND init-config so the init container
  // can detect API keys and set agents.defaults.model on next restart.
  return patchDeploymentEnvVarsBoth(ns, 'openclaw', 'openclaw', 'init-config', keys);
}

export function isWizardCompleted(): boolean {
  return loadConfig().wizardCompleted === true;
}

export function markWizardCompleted() {
  saveConfig({ wizardCompleted: true });
}
