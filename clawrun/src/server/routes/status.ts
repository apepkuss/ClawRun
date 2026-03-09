import { Router } from 'express';
import { checkHealth as openclawHealth, getConnection, autoConfigureToken, autoConfigureUiUrl as autoConfigureOpenclawUiUrl, getReplicaInfo, applyPendingConfigIfReady, applyPendingPluginIfReady } from '../services/openclaw';
import { checkStatus as ollamaStatus, getConnection as getOllamaConnection, autoConfigureUiUrl as autoConfigureOllamaUiUrl } from '../services/ollama';
import { getPluginStatus as getClawRouterStatus } from '../services/clawrouter';
import { getAppManagerState } from '../services/k8s';
import { getOlaresUsername } from '../services/app-manager';

const router = Router();

// Extract Olares base domain from request Host header.
// E.g., "9e7e09910.apepkuss.olares.cn" → "apepkuss.olares.cn"
function getOlaresBaseDomain(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0]; // remove port
  // Olares URL: <appId (8 hex)><entranceIndex>.<username>.<domain>
  if (!/^[0-9a-f]{8,}/i.test(hostname)) return null;
  const parts = hostname.split('.');
  if (parts.length < 3) return null;
  return parts.slice(1).join('.');
}

// GET /api/status  — 聚合状态（前端每 10 秒轮询）
router.get('/', async (req, res) => {
  const username = getOlaresUsername();
  const baseDomain = getOlaresBaseDomain(req.headers.host);
  const [openclawHealthy, ollamaHealthy, openclawInfo, openclawReplicas, clawRouterStatus] = await Promise.all([
    openclawHealth(),
    ollamaStatus(),
    getAppManagerState('openclaw', username),
    getReplicaInfo(username),
    getClawRouterStatus(username),
  ]);

  // Sync OpenClaw token from K8s deployment (verifies periodically).
  // Must run even when health check fails — endpoint may be empty after config reset,
  // and autoConfigureToken will construct the default endpoint from namespace.
  let conn = getConnection();
  const openclawReady = openclawInfo.state === 'running' ||
    (openclawReplicas && openclawReplicas.desired > 0 && openclawReplicas.ready > 0);
  if (openclawReady) {
    await autoConfigureToken(username);
    conn = getConnection();
  }

  // Apply pending plugin action after restart (fire-and-forget)
  if (openclawHealthy) {
    void applyPendingPluginIfReady(username);
  }

  // Apply pending config entries after restart (fire-and-forget)
  if (openclawHealthy) {
    void applyPendingConfigIfReady(username);
  }

  // Auto-detect external UI URLs from Olares URL pattern
  if (openclawHealthy && baseDomain) {
    autoConfigureOpenclawUiUrl(baseDomain);
    conn = getConnection();
  }
  let ollamaConn = getOllamaConnection();
  if (ollamaHealthy && !ollamaConn.uiUrl && baseDomain) {
    autoConfigureOllamaUiUrl(baseDomain, ollamaConn.variant);
    ollamaConn = getOllamaConnection();
  }
  res.json({
    openclaw: {
      healthy: openclawHealthy,
      endpoint: conn.endpoint || null,
      uiUrl: conn.uiUrl || null,
      token: conn.token || null,
      installState: openclawInfo.state,
      installProgress: openclawInfo.progress,
      replicas: openclawReplicas,
    },
    ollama: {
      healthy: ollamaHealthy,
      endpoint: ollamaConn.endpoint || null,
      variant: ollamaConn.variant ?? null,
    },
    clawrouter: {
      installed: clawRouterStatus.installed,
    },
  });
});

export default router;
