import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { getDeploymentEnvVar, getDeploymentEnvVars, patchDeploymentEnvVarsBoth, labelNamespace } from './k8s';

const CONFIG_FILE = '/app/data/config.json';

interface Config {
  openclaw?: { endpoint: string; token: string; uiUrl?: string };
  ollama?: { endpoint: string };
  wizardCompleted?: boolean;
  pendingEnv?: { envs: Record<string, string>; patchBypass: boolean } | null;
  pendingConfig?: { entries: { key: string; value: string }[] } | null;
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

// Set OpenClaw config via kubectl exec (OpenClaw has no REST /api/config endpoint).
// Runs `node dist/index.js config set <key> <value>` inside the OpenClaw pod.
// Config is persisted to hostPath volume (/home/node/.openclaw/config.json).
export async function setConfigViaExec(username: string, key: string, value: string): Promise<boolean> {
  const ns = `openclaw-${username}`;
  const escaped = value.replace(/'/g, "'\\''");
  return new Promise((resolve) => {
    exec(
      `kubectl exec -n ${ns} deploy/openclaw -c openclaw -- node dist/index.js config set ${key} '${escaped}'`,
      { timeout: 15000 },
      (err, _stdout, stderr) => {
        if (err) {
          console.error(`[openclaw] config set ${key} failed:`, stderr || err.message);
          resolve(false);
          return;
        }
        console.log(`[openclaw] config set ${key} ok`);
        resolve(true);
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
  return patchDeploymentEnvVarsBoth(ns, 'openclaw', 'openclaw', 'init-config', keys);
}

export function isWizardCompleted(): boolean {
  return loadConfig().wizardCompleted === true;
}

export function markWizardCompleted() {
  saveConfig({ wizardCompleted: true });
}

// Store pending env vars to be applied on next restart.
export function setPendingEnv(pending: { envs: Record<string, string>; patchBypass: boolean } | null) {
  saveConfig({ pendingEnv: pending });
}

export function getPendingEnv(): { envs: Record<string, string>; patchBypass: boolean } | null {
  return loadConfig().pendingEnv ?? null;
}

// Store pending config entries to be applied after restart (when pod is running).
export function setPendingConfig(entries: { key: string; value: string }[] | null) {
  saveConfig({ pendingConfig: entries ? { entries } : null });
}

export function getPendingConfig(): { entries: { key: string; value: string }[] } | null {
  return loadConfig().pendingConfig ?? null;
}

// Apply pending config entries if the pod is running.
// Called from status polling — non-blocking, fire-and-forget.
let applyingPendingConfig = false;
export async function applyPendingConfigIfReady(username: string): Promise<void> {
  if (applyingPendingConfig) return;
  const pending = getPendingConfig();
  if (!pending || pending.entries.length === 0) {
    setPendingConfig(null);
    return;
  }

  // Check if OpenClaw pod is actually running
  const healthy = await checkHealth();
  if (!healthy) return;

  applyingPendingConfig = true;
  console.log(`[openclaw] applying ${pending.entries.length} pending config entries`);
  try {
    let failed = 0;
    // Run sequentially to avoid OOMKill — each `config set` spawns a full Node.js process
    for (const e of pending.entries) {
      const ok = await setConfigViaExec(username, e.key, e.value);
      if (!ok) failed++;
    }
    if (failed > 0) {
      console.error(`[openclaw] ${failed}/${pending.entries.length} pending config sets failed`);
    } else {
      console.log('[openclaw] all pending config entries applied successfully');
    }
    setPendingConfig(null);
  } finally {
    applyingPendingConfig = false;
  }
}

// Apply pending env vars (if any) and restart.
// Returns true if restart was initiated.
export async function applyPendingAndRestart(username: string): Promise<boolean> {
  const pending = getPendingEnv();
  if (pending) {
    if (pending.patchBypass) {
      await patchOutboundBypass(username);
    }
    if (Object.keys(pending.envs).length > 0) {
      const ok = await setApiKeys(username, pending.envs);
      if (!ok) return false;
      // env patch already triggers pod restart, clear pending
      setPendingEnv(null);
      return true;
    }
    setPendingEnv(null);
  }
  // No env patch (or empty envs): explicit restart
  return restartDeploy(username);
}

// Ensure OpenClaw namespace has the label required by Ollama's NetworkPolicy.
// iptables bypass is now baked into the OpenClaw Helm chart (sidecar container).
export async function patchOutboundBypass(username: string): Promise<boolean> {
  const ns = `openclaw-${username}`;
  return labelNamespace(ns, { 'bytetrade.io/ns-type': 'user-internal' });
}

// Stop OpenClaw by scaling deployment to 0 replicas.
export async function stopDeploy(username: string): Promise<boolean> {
  const ns = `openclaw-${username}`;
  return new Promise((resolve) => {
    exec(
      `kubectl scale deploy/openclaw -n ${ns} --replicas=0`,
      { timeout: 15000 },
      (err, _stdout, stderr) => {
        if (err) {
          console.error('[openclaw] scale to 0 failed:', stderr || err.message);
          resolve(false);
          return;
        }
        console.log(`[openclaw] scaled to 0 (ns=${ns})`);
        resolve(true);
      },
    );
  });
}

// Start OpenClaw by scaling deployment to 1 replica.
export async function startDeploy(username: string): Promise<boolean> {
  const ns = `openclaw-${username}`;
  return new Promise((resolve) => {
    exec(
      `kubectl scale deploy/openclaw -n ${ns} --replicas=1`,
      { timeout: 15000 },
      (err, _stdout, stderr) => {
        if (err) {
          console.error('[openclaw] scale to 1 failed:', stderr || err.message);
          resolve(false);
          return;
        }
        console.log(`[openclaw] scaled to 1 (ns=${ns})`);
        resolve(true);
      },
    );
  });
}

// Get OpenClaw deployment replica counts.
export async function getReplicaInfo(username: string): Promise<{ desired: number; ready: number } | null> {
  const ns = `openclaw-${username}`;
  return new Promise((resolve) => {
    exec(
      `kubectl get deploy/openclaw -n ${ns} -o jsonpath='{.spec.replicas} {.status.readyReplicas}'`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const parts = stdout.replace(/'/g, '').trim().split(' ');
        const desired = parseInt(parts[0], 10) || 0;
        const ready = parseInt(parts[1], 10) || 0;
        resolve({ desired, ready });
      },
    );
  });
}

// Restart OpenClaw pod via kubectl rollout restart.
export async function restartDeploy(username: string): Promise<boolean> {
  const ns = `openclaw-${username}`;
  return new Promise((resolve) => {
    exec(
      `kubectl rollout restart deploy/openclaw -n ${ns}`,
      { timeout: 15000 },
      (err, _stdout, stderr) => {
        if (err) {
          console.error('[openclaw] rollout restart failed:', stderr || err.message);
          resolve(false);
          return;
        }
        console.log(`[openclaw] rollout restart ok (ns=${ns})`);
        resolve(true);
      },
    );
  });
}

export function clearConfig() {
  // Reset in-memory state so status polling won't restore the config
  endpoint = '';
  token = '';
  uiUrl = '';
  lastTokenSync = 0;

  // Clear persisted config
  const cfg = loadConfig();
  delete cfg.openclaw;
  delete cfg.wizardCompleted;
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
