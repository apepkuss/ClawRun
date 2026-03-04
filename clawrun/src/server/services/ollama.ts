import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec, spawn } from 'child_process';
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

// HTTP helper using curl. curl sends proper HTTP/1.1 headers that pass through Olares Envoy sidecar.
// Uses external commands instead of fetch because Node.js undici is incompatible with Olares Envoy iptables.
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

// Health check via curl — any HTTP response (including 400 from Envoy sidecar) means alive
export async function checkStatus(): Promise<boolean> {
  if (!endpoint) return false;
  return new Promise((resolve) => {
    exec(
      `curl -s -S -o /dev/null -D - --max-time 5 "${endpoint}/api/tags" 2>&1`,
      { timeout: 10000 },
      (_err, stdout) => resolve(stdout.includes('HTTP/')),
    );
  });
}

export async function listModels(): Promise<unknown> {
  const { ok, body } = await httpReq(`${endpoint}/api/tags`);
  if (!ok) throw new Error(`Ollama listModels failed`);
  return JSON.parse(body);
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
  // Initialize job
  pullJobs.set(name, { status: '准备中…', percent: -1, done: false, success: false });

  const proc = spawn('curl', [
    '-s', '-S', '-N',
    '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ name }),
    `${endpoint}/api/pull`,
  ]);

  let buffer = '';

  function processLine(line: string) {
    if (!line.trim()) return;
    try {
      const d = JSON.parse(line) as {
        status?: string; total?: number; completed?: number;
        error?: string;
      };
      const job = pullJobs.get(name);
      if (!job || job.done) return;
      if (d.error) {
        job.error = d.error;
        job.status = 'error';
      }
      if (d.status === 'success') {
        job.success = true;
        job.done = true;
        job.status = 'success';
        job.percent = 100;
      } else if (d.status) {
        job.status = d.status;
      }
      if (d.total && d.total > 0 && d.completed != null) {
        job.total = d.total;
        job.completed = d.completed;
        job.percent = Math.round((d.completed / d.total) * 100);
      }
    } catch { /* skip unparseable */ }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) processLine(line);
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) {
      const job = pullJobs.get(name);
      if (job && !job.done) {
        job.error = msg;
      }
    }
  });

  proc.on('close', (code: number | null) => {
    if (buffer.trim()) processLine(buffer);
    const job = pullJobs.get(name);
    if (job && !job.done) {
      job.done = true;
      if (!job.success) {
        job.error = job.error || `curl exited with code ${code}`;
      }
    }
    // Clean up after 5 minutes
    setTimeout(() => pullJobs.delete(name), 5 * 60 * 1000);
  });
}

export async function deleteModel(name: string): Promise<unknown> {
  const { ok, body } = await httpReq(`${endpoint}/api/delete`, {
    method: 'DELETE',
    body: JSON.stringify({ name }),
  });
  if (!ok) throw new Error(`Ollama delete failed`);
  try { return JSON.parse(body); } catch { return { ok: true }; }
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
