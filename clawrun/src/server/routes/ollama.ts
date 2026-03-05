import { Router } from 'express';
import * as ollama from '../services/ollama';

const router = Router();

// POST /api/ollama/connect   body: { endpoint, uiUrl? }
router.post('/connect', (req, res) => {
  const { endpoint, uiUrl } = req.body as { endpoint: string; uiUrl?: string };
  if (!endpoint) {
    res.status(400).json({ error: 'endpoint is required' });
    return;
  }
  ollama.setConnection(endpoint, uiUrl);
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

// GET /api/ollama/library — remote model catalog from ollama.com
router.get('/library', async (_req, res) => {
  try {
    const models = await ollama.fetchLibrary();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/ollama/library/:model/tags — tags for a specific model
router.get('/library/:model/tags', async (req, res) => {
  try {
    const tags = await ollama.fetchModelTags(req.params.model);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/ollama/models   body: { name }
router.delete('/models', async (req, res) => {
  try {
    const result = await ollama.deleteModel(req.body.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/ollama/models/pull   body: { name }   — start pull in background
router.post('/models/pull', (req, res) => {
  const name = (req.body as { name: string }).name;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  ollama.startPull(name);
  res.json({ ok: true });
});

// GET /api/ollama/models/pull/status?name=xxx   — poll pull progress
router.get('/models/pull/status', (req, res) => {
  const name = req.query.name as string;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const status = ollama.getPullStatus(name);
  if (!status) { res.json({ active: false }); return; }
  res.json({ active: true, ...status });
});

// POST /api/ollama/patch-bypass — patch Ollama deployment to bypass inbound Envoy
router.post('/patch-bypass', async (_req, res) => {
  try {
    const ok = await ollama.patchInboundBypass();
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
