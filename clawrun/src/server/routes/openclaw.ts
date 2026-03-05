import { Router } from 'express';
import * as openclaw from '../services/openclaw';
import { getOlaresUsername } from '../services/app-manager';

const router = Router();

// POST /api/openclaw/connect   body: { endpoint?, token?, uiUrl? }
// endpoint+token are optional if already configured; omitting them keeps existing values.
router.post('/connect', (req, res) => {
  const { endpoint, token, uiUrl } = req.body as { endpoint?: string; token?: string; uiUrl?: string };
  const existing = openclaw.getConnection();
  const ep = (endpoint ?? '').trim() || existing.endpoint;
  const tk = (token ?? '').trim() || existing.token;
  if (!ep || !tk) {
    res.status(400).json({ error: 'endpoint and token are required' });
    return;
  }
  openclaw.setConnection(ep, tk, uiUrl);
  res.json({ ok: true });
});

// GET /api/openclaw/health
router.get('/health', async (_req, res) => {
  const healthy = await openclaw.checkHealth();
  res.json({ healthy });
});

// POST /api/openclaw/config/batch   body: { entries: [{ key, value }] }
// Sets config via kubectl exec → `node dist/index.js config set` inside OpenClaw pod.
// Responds immediately and runs config sets in background to avoid Envoy timeout
// (each config set triggers Ollama model discovery which can take 10+ seconds).
router.post('/config/batch', (req, res) => {
  const { entries } = req.body as { entries: { key: string; value: unknown }[] };
  if (!entries || entries.length === 0) {
    res.json({ ok: true });
    return;
  }
  const username = getOlaresUsername();
  res.json({ ok: true });

  // Fire-and-forget: run config sets sequentially in background
  (async () => {
    for (const entry of entries) {
      const val = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
      await openclaw.setConfigViaExec(username, entry.key, val);
    }
  })().catch((err) => console.error('[openclaw] background config/batch failed:', err));
});

// GET /api/openclaw/env — read which API key env vars are set on OpenClaw Deployment
router.get('/env', async (_req, res) => {
  const username = getOlaresUsername();
  const configured = await openclaw.getApiKeyStatus(username);
  res.json({ configured });
});

// POST /api/openclaw/env   body: { envs: Record<string, string> }
// Patch API key env vars on the OpenClaw Deployment (triggers pod restart)
router.post('/env', async (req, res) => {
  const { envs } = req.body as { envs: Record<string, string> };
  if (!envs || Object.keys(envs).length === 0) {
    res.status(400).json({ error: 'envs is required' });
    return;
  }
  const username = getOlaresUsername();
  const ok = await openclaw.setApiKeys(username, envs);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to patch deployment env vars' });
  }
});

// GET /api/openclaw/wizard-status
router.get('/wizard-status', (_req, res) => {
  res.json({ completed: openclaw.isWizardCompleted() });
});

// POST /api/openclaw/patch-bypass — patch OpenClaw deployment to add outbound Envoy bypass for Ollama
router.post('/patch-bypass', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await openclaw.patchOutboundBypass(username);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to patch OpenClaw deployment' });
  }
});

// POST /api/openclaw/wizard-complete
router.post('/wizard-complete', (_req, res) => {
  openclaw.markWizardCompleted();
  res.json({ ok: true });
});

export default router;
