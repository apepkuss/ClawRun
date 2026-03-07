import { exec, spawn } from 'child_process';

// Ollama API base URL — the UI runs in the same namespace as Ollama,
// traffic goes through iptables bypass (no Envoy interception).
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://ollama-cpu-svc:11434';

// --- HTTP helpers ---

function httpGet(url: string, timeout = 10000): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve) => {
    exec(
      `curl -s -S -o - -w '\\n%{http_code}' "${url}" 2>&1`,
      { timeout, maxBuffer: 10 * 1024 * 1024 },
      (_err: unknown, stdout: string) => {
        const lines = stdout.trimEnd().split('\n');
        const statusLine = lines.pop() ?? '';
        const status = parseInt(statusLine, 10);
        const body = lines.join('\n');
        resolve({ ok: status >= 200 && status < 300, status, body });
      },
    );
  });
}

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
      const parts = stdout.split('\r\n\r\n');
      const body = parts.length > 1 ? parts.slice(1).join('\r\n\r\n').trim() : stdout.trim();
      resolve({ ok, body });
    });
  });
}

// --- Health check ---

export async function checkHealth(): Promise<boolean> {
  try {
    const { ok } = await httpGet(`${OLLAMA_BASE}/api/version`, 5000);
    return ok;
  } catch {
    return false;
  }
}

// --- Model list ---

export async function listModels(): Promise<unknown> {
  const { ok, body } = await httpGet(`${OLLAMA_BASE}/api/tags`);
  if (!ok) throw new Error(`Ollama listModels failed: ${body.slice(0, 300)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Ollama listModels: invalid JSON: ${body.slice(0, 300)}`);
  }
}

// --- Delete model ---

export async function deleteModel(name: string): Promise<unknown> {
  const { ok, body } = await httpReq(`${OLLAMA_BASE}/api/delete`, {
    method: 'DELETE',
    body: JSON.stringify({ name }),
  });
  if (!ok && body) throw new Error(`Ollama delete failed: ${body.slice(0, 300)}`);
  return { ok: true };
}

// --- Pull jobs ---

export interface PullProgress {
  status: string;
  total?: number;
  completed?: number;
  percent: number;
  error?: string;
  done: boolean;
  success: boolean;
}

const pullJobs = new Map<string, PullProgress>();

export function getPullStatus(name: string): PullProgress | null {
  return pullJobs.get(name) ?? null;
}

export function startPull(name: string): void {
  pullJobs.set(name, { status: '准备中…', percent: -1, done: false, success: false });

  // Use curl to stream the pull API — it sends newline-delimited JSON
  const args = [
    '-s', '-S', '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ name, stream: true }),
    `${OLLAMA_BASE}/api/pull`,
  ];
  const proc = spawn('curl', args);

  let buffer = '';

  function processLine(line: string) {
    const job = pullJobs.get(name);
    if (!job || job.done) return;
    try {
      const data = JSON.parse(line);
      if (data.error) {
        job.error = data.error;
        job.status = 'error';
        job.done = true;
        return;
      }
      job.status = data.status ?? job.status;
      if (data.total && data.completed) {
        job.total = data.total;
        job.completed = data.completed;
        job.percent = Math.round((data.completed / data.total) * 100);
      }
      if (data.status === 'success') {
        job.success = true;
        job.done = true;
        job.percent = 100;
      }
    } catch {
      // non-JSON line, ignore
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim()) processLine(part);
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    const job = pullJobs.get(name);
    if (job && !job.done && text.includes('error')) {
      job.error = text.trim();
    }
  });

  proc.on('close', (code: number | null) => {
    if (buffer.trim()) processLine(buffer);
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

// --- Ollama library (remote model catalog) ---

let libraryCache: { models: string[]; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

export async function fetchLibrary(): Promise<string[]> {
  if (libraryCache && Date.now() - libraryCache.ts < CACHE_TTL) {
    return libraryCache.models;
  }
  try {
    const { body } = await httpReq('https://ollama.com/library');
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
    // ignore
  }
  return [];
}

// --- Model tags ---

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
    const tagPattern = new RegExp(`href="/library/${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([^"]+)"`, 'gi');
    const tags: ModelTag[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tagPattern.exec(body)) !== null) {
      const tag = m[1];
      if (seen.has(tag)) continue;
      seen.add(tag);
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
