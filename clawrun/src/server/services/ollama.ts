import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec, spawn } from 'child_process';
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
// Olares: single entrance = {appId}.{zone}, multi = {appId}{index}.{zone}
export function autoConfigureUiUrl(baseDomain: string, v: OllamaVariant): void {
  if (!v || !baseDomain) return;

  // Ollama has 1 entrance → no index suffix
  const appName = v === 'cpu' ? 'ollama-cpu' : 'ollama';
  const appId = crypto.createHash('md5').update(appName).digest('hex').substring(0, 8);
  const expected = `https://${appId}.${baseDomain}`;
  if (uiUrl === expected) return; // already correct

  uiUrl = expected;
  persist();
  console.log(`[ollama] auto-configured uiUrl: ${expected}`);
}

// --- kubectl exec helpers ---
// All Ollama API calls go through kubectl exec to bypass Envoy sidecar auth.
// Inside the Ollama pod, localhost:11434 is always accessible without auth.

function getOllamaK8sTarget(): { namespace: string; deployment: string } | null {
  if (!variant) return null;
  const user = getUsername();
  if (variant === 'cpu') {
    return { namespace: `ollama-cpu-${user}`, deployment: 'ollama-cpu' };
  }
  return { namespace: `ollama-${user}`, deployment: 'ollama' };
}

function kubectlExec(command: string[], timeout = 30000): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    const target = getOllamaK8sTarget();
    if (!target) {
      resolve({ ok: false, body: 'Ollama variant not configured' });
      return;
    }
    const args = [
      'exec', '-n', target.namespace,
      `deploy/${target.deployment}`,
      '-c', target.deployment,  // specify container (pod has envoy sidecar)
      '--',
      ...command,
    ];

    let stdout = '';
    let stderr = '';
    const proc = spawn('kubectl', args);

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, body: `kubectl exec timed out (${timeout}ms)` });
    }, timeout);

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error(`[ollama] kubectl exec failed (exit ${code}):`, stderr.slice(0, 300));
        resolve({ ok: false, body: stderr || stdout });
      } else {
        resolve({ ok: true, body: stdout });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      console.error(`[ollama] kubectl exec error:`, err.message);
      resolve({ ok: false, body: err.message });
    });
  });
}

// --- HTTP helper for external requests (ollama.com library/tags) ---

function httpReq(url: string, opts?: { method?: string; body?: string; timeout?: number }): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    const method = opts?.method ?? 'GET';
    const timeout = opts?.timeout ?? 30000;
    let cmd = `curl -s -S -D - -X ${method} -H 'Content-Type: application/json'`;
    if (opts?.body) {
      cmd += ` -d '${opts.body.replace(/'/g, "'\\''")}'`;
    }
    cmd += ` "${url}" 2>&1`;
    exec(cmd, { timeout, maxBuffer: 10 * 1024 * 1024 }, (_err: unknown, stdout: string) => {
      const ok = stdout.includes('HTTP/') && /HTTP\/\S+\s+2\d\d/.test(stdout);
      // Extract body: everything after the last blank line in curl -D output
      const parts = stdout.split('\r\n\r\n');
      const body = parts.length > 1 ? parts.slice(1).join('\r\n\r\n').trim() : stdout.trim();
      resolve({ ok, body });
    });
  });
}

// --- Ollama API via kubectl exec ---

export async function checkStatus(): Promise<boolean> {
  const target = getOllamaK8sTarget();
  if (!target) return false;
  // Use kubectl get deploy (existing RBAC) instead of kubectl exec (requires pods/exec RBAC)
  return new Promise((resolve) => {
    exec(
      `kubectl get deploy/${target.deployment} -n ${target.namespace} -o jsonpath='{.status.readyReplicas}'`,
      { timeout: 10000 },
      (_err: unknown, stdout: string) => {
        const ready = parseInt(stdout.replace(/'/g, ''), 10);
        resolve(ready > 0);
      },
    );
  });
}

export async function listModels(): Promise<unknown> {
  const target = getOllamaK8sTarget();
  if (!target) throw new Error('Ollama variant not configured');
  const { ok, body } = await kubectlExec(['ollama', 'list'], 15000);
  if (!ok) throw new Error(`Ollama listModels failed: ${body.slice(0, 300)}`);

  // Parse "ollama list" text output into /api/tags compatible format
  // Format: NAME  ID  SIZE  MODIFIED
  const lines = body.trim().split('\n');
  const models: Array<{ name: string; model: string; size: number; details: Record<string, unknown> }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/\s{2,}/);
    if (cols.length < 3) continue;
    const name = cols[0].trim();
    const sizeStr = cols[2]?.trim() ?? '';
    let size = 0;
    const sm = sizeStr.match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
    if (sm) {
      const n = parseFloat(sm[1]);
      const u = sm[2].toUpperCase();
      const mult: Record<string, number> = { KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
      size = Math.round(n * (mult[u] ?? 1));
    }
    models.push({ name, model: name, size, details: {} });
  }
  return { models };
}

// --- Pull jobs (polling-based progress tracking) ---

export interface PullProgress {
  status: string;
  total?: number;
  completed?: number;
  percent: number;     // 0-100 or -1 if unknown
  error?: string;
  done: boolean;
  success: boolean;
}

const pullJobs = new Map<string, PullProgress>();

export function getPullStatus(name: string): PullProgress | null {
  return pullJobs.get(name) ?? null;
}

export function startPull(name: string): void {
  const target = getOllamaK8sTarget();
  if (!target) {
    pullJobs.set(name, { status: 'error', percent: -1, done: true, success: false, error: 'Ollama variant not configured' });
    return;
  }

  pullJobs.set(name, { status: '准备中…', percent: -1, done: false, success: false });

  // Use "ollama pull" CLI inside Ollama pod (no curl needed)
  const args = [
    'exec', '-n', target.namespace,
    `deploy/${target.deployment}`,
    '-c', target.deployment,
    '--',
    'ollama', 'pull', name,
  ];
  const proc = spawn('kubectl', args);

  let buffer = '';
  let stderrBuf = '';

  function processChunk(text: string) {
    const job = pullJobs.get(name);
    if (!job || job.done) return;

    // ollama pull outputs lines like:
    //   pulling manifest
    //   pulling abc123...  45% ▕██...▏ 1.2 GB/2.0 GB
    //   verifying sha256 digest
    //   writing manifest
    //   success
    const lower = text.toLowerCase();
    if (lower.includes('success')) {
      job.success = true;
      job.done = true;
      job.status = 'success';
      job.percent = 100;
      return;
    }
    if (lower.includes('error') || lower.includes('failed')) {
      job.error = text.trim();
      job.status = 'error';
      return;
    }
    // Extract percentage
    const pctMatch = text.match(/(\d+)%/);
    if (pctMatch) {
      job.percent = parseInt(pctMatch[1], 10);
    }
    // Extract size info (e.g. "1.2 GB/2.0 GB")
    const sizeMatch = text.match(/([\d.]+\s*[KMGT]B)\s*\/\s*([\d.]+\s*[KMGT]B)/i);
    if (sizeMatch) {
      job.status = `${sizeMatch[1]} / ${sizeMatch[2]}`;
    } else {
      // Use text as status (e.g. "pulling manifest", "verifying sha256 digest")
      const clean = text.replace(/[▕▏█░\s]+/g, ' ').trim().slice(0, 80);
      if (clean) job.status = clean;
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    // Split on \n or \r (ollama uses \r for in-place progress updates)
    const parts = buffer.split(/[\r\n]+/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim()) processChunk(part);
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    // ollama pull may write progress to stderr too
    const parts = stderrBuf.split(/[\r\n]+/);
    stderrBuf = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim()) processChunk(part);
    }
  });

  proc.on('close', (code: number | null) => {
    if (buffer.trim()) processChunk(buffer);
    if (stderrBuf.trim()) processChunk(stderrBuf);
    const job = pullJobs.get(name);
    if (job && !job.done) {
      job.done = true;
      if (code === 0 && !job.error) {
        job.success = true;
        job.percent = 100;
        job.status = 'success';
      } else if (!job.success) {
        job.error = job.error || `pull failed (exit ${code})`;
      }
    }
    setTimeout(() => pullJobs.delete(name), 5 * 60 * 1000);
  });
}

export async function deleteModel(name: string): Promise<unknown> {
  const target = getOllamaK8sTarget();
  if (!target) throw new Error('Ollama variant not configured');
  const { ok, body } = await kubectlExec(['ollama', 'rm', name], 35000);
  if (!ok && body) throw new Error(`Ollama delete failed: ${body.slice(0, 300)}`);
  return { ok: true };
}

// --- Ollama library (remote model catalog) ---

let libraryCache: { models: string[]; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchLibrary(): Promise<string[]> {
  if (libraryCache && Date.now() - libraryCache.ts < CACHE_TTL) {
    return libraryCache.models;
  }
  try {
    const { body } = await httpReq('https://ollama.com/library');
    // ollama.com/library page contains links like href="/library/modelname"
    const matches = body.match(/href="\/library\/([a-z0-9._-]+)"/gi);
    if (!matches || matches.length === 0) return [];
    const names = [...new Set(
      matches.map((m) => {
        const match = m.match(/\/library\/([a-z0-9._-]+)/i);
        return match ? match[1] : '';
      }).filter(Boolean),
    )];
    if (names.length > 0) {
      libraryCache = { models: names, ts: Date.now() };
      return names;
    }
  } catch {
    // ignore — returns empty list, frontend degrades to plain input
  }
  return [];
}

// --- Model tags (per-model version/quantization list) ---

export interface ModelTag {
  tag: string;
  size: string;
}

const tagsCache = new Map<string, { tags: ModelTag[]; ts: number }>();

export async function fetchModelTags(model: string): Promise<ModelTag[]> {
  const cached = tagsCache.get(model);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.tags;
  }
  try {
    const { body } = await httpReq(`https://ollama.com/library/${encodeURIComponent(model)}/tags`);
    // Tags page has links like href="/library/qwen2.5:7b" with size text nearby
    // Match href patterns: /library/model:tag
    const tagPattern = new RegExp(`href="/library/${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([^"]+)"`, 'gi');
    const tags: ModelTag[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tagPattern.exec(body)) !== null) {
      const tag = m[1];
      if (seen.has(tag)) continue;
      seen.add(tag);
      // Try to find size near this match (look ahead for pattern like "4.7GB" or "398MB")
      const after = body.slice(m.index, m.index + 500);
      const sizeMatch = after.match(/(\d+(?:\.\d+)?\s*[KMGT]B)/i);
      tags.push({ tag, size: sizeMatch ? sizeMatch[1] : '' });
    }
    if (tags.length > 0) {
      tagsCache.set(model, { tags, ts: Date.now() });
      return tags;
    }
  } catch {
    // ignore
  }
  return [];
}
