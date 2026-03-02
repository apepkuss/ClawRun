import { Router } from 'express';
import * as openclaw from '../services/openclaw';

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

export default router;
