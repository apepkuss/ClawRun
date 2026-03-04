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

// GET /api/openclaw/config
router.get('/config', async (_req, res) => {
  try {
    const config = await openclaw.getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/openclaw/config   body: { key, value }
router.post('/config', async (req, res) => {
  try {
    const result = await openclaw.setConfig(req.body.key, req.body.value);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/openclaw/config/batch   body: { entries: [{ key, value }] }
router.post('/config/batch', async (req, res) => {
  try {
    const { entries } = req.body as { entries: { key: string; value: unknown }[] };
    const results = [];
    for (const entry of entries) {
      const result = await openclaw.setConfig(entry.key, entry.value);
      results.push(result);
    }
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
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

// POST /api/openclaw/wizard-complete
router.post('/wizard-complete', (_req, res) => {
  openclaw.markWizardCompleted();
  res.json({ ok: true });
});

export default router;
