import { Router } from 'express';
import { checkHealth as openclawHealth, getConnection } from '../services/openclaw';
import { checkStatus as ollamaStatus, getConnection as getOllamaConnection } from '../services/ollama';

const router = Router();

// GET /api/status  — 聚合状态（前端每 10 秒轮询）
router.get('/', async (_req, res) => {
  const [openclawHealthy, ollamaHealthy] = await Promise.all([
    openclawHealth(),
    ollamaStatus(),
  ]);

  const conn = getConnection();
  const ollamaConn = getOllamaConnection();
  res.json({
    openclaw: {
      healthy: openclawHealthy,
      endpoint: conn.endpoint || null,
      uiUrl: conn.uiUrl || null,
    },
    ollama: {
      healthy: ollamaHealthy,
      endpoint: ollamaConn.endpoint || null,
      uiUrl: ollamaConn.uiUrl || null,
    },
  });
});

export default router;
