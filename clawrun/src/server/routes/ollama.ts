import { Router } from 'express';
import * as ollama from '../services/ollama';

const router = Router();

// POST /api/ollama/connect   body: { endpoint }
router.post('/connect', (req, res) => {
  const { endpoint } = req.body as { endpoint: string };
  if (!endpoint) {
    res.status(400).json({ error: 'endpoint is required' });
    return;
  }
  ollama.setEndpoint(endpoint);
  res.json({ ok: true });
});

// GET /api/ollama/health
router.get('/health', async (_req, res) => {
  const healthy = await ollama.checkStatus();
  res.json({ healthy });
});

// GET /api/ollama/models
router.get('/models', async (_req, res) => {
  try {
    const models = await ollama.listModels();
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/ollama/models/pull   body: { name }
router.post('/models/pull', async (req, res) => {
  try {
    const result = await ollama.pullModel(req.body.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
