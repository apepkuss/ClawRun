import { Router } from 'express';
import { checkHealth as openclawHealth, getConnection, autoConfigureToken, autoConfigureUiUrl as autoConfigureOpenclawUiUrl, getReplicaInfo, applyPendingConfigIfReady } from '../services/openclaw';
import { checkStatus as ollamaStatus, getConnection as getOllamaConnection, autoConfigureUiUrl as autoConfigureOllamaUiUrl } from '../services/ollama';
import { checkHealth as litellmHealth, getReplicaInfo as litellmReplicaInfo, getLiteLLMConfig, autoSyncMasterKey } from '../services/litellm';
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
  const [openclawHealthy, ollamaHealthy, litellmHealthy, openclawInfo, litellmInfo, openclawReplicas, litellmReplicas] = await Promise.all([
    openclawHealth(),
    ollamaStatus(),
    litellmHealth(username),
    getAppManagerState('openclaw', username),
    getAppManagerState('litellm', username),
    getReplicaInfo(username),
    litellmReplicaInfo(username),
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
  // Sync LiteLLM master key from K8s deployment
  const litellmReady = litellmInfo.state === 'running' ||
    (litellmReplicas && litellmReplicas.desired > 0 && litellmReplicas.ready > 0);
  if (litellmReady) {
    await autoSyncMasterKey(username);
  }

  const litellmCfg = getLiteLLMConfig();

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
    litellm: {
      healthy: litellmHealthy,
      endpoint: litellmCfg?.endpoint || null,
      installState: litellmInfo.state,
      installProgress: litellmInfo.progress,
      replicas: litellmReplicas,
    },
  });
});

export default router;
