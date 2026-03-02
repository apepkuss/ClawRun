import { Router } from 'express';
import { installApp, uninstallApp } from '../services/app-manager';

const router = Router();

// POST /api/apps/:name/install   body: { repoUrl }
router.post('/:name/install', async (req, res) => {
  try {
    const result = await installApp(req.params.name, req.body.repoUrl);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/apps/:name/uninstall
router.post('/:name/uninstall', async (req, res) => {
  try {
    const result = await uninstallApp(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
