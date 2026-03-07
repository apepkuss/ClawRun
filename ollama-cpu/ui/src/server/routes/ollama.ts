import { Router } from 'express';
import * as ollama from '../services/ollama';

const router = Router();

// GET /api/ollama/health
router.get('/health', async (_req, res) => {
  const healthy = await ollama.checkHealth();
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

// DELETE /api/ollama/models   body: { name }
router.delete('/models', async (req, res) => {
  try {
    const result = await ollama.deleteModel(req.body.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/ollama/models/pull   body: { name }
router.post('/models/pull', (req, res) => {
  const name = (req.body as { name: string }).name;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  ollama.startPull(name);
  res.json({ ok: true });
});

// GET /api/ollama/models/pull/status?name=xxx
router.get('/models/pull/status', (req, res) => {
  const name = req.query.name as string;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const status = ollama.getPullStatus(name);
  if (!status) { res.json({ active: false }); return; }
  res.json({ active: true, ...status });
});

// GET /api/ollama/library
router.get('/library', async (_req, res) => {
  try {
    const models = await ollama.fetchLibrary();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/ollama/library/:model/tags
router.get('/library/:model/tags', async (req, res) => {
  try {
    const tags = await ollama.fetchModelTags(req.params.model);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
