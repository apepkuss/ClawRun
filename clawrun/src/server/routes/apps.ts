import { Router, Request } from 'express';
import { installApp, uninstallApp, getOlaresUsername } from '../services/app-manager';
import { setVariant, setConnection } from '../services/ollama';
import { setConnection as setOpenclawConnection, clearConfig as clearOpenclawConfig } from '../services/openclaw';

const router = Router();

function getAuthInfo(req: Request): { bflUser: string; accessToken: string | null } {
  // Log all incoming headers for debugging
  const headerKeys = Object.keys(req.headers);
  console.log('[auth] incoming headers:', headerKeys.join(', '));

  const user = req.headers['x-bfl-user'];
  if (!user || typeof user !== 'string') {
    throw new Error('Missing x-bfl-user header (Olares username not injected)');
  }

  // Envoy injects remote-accesstoken (LLDAP JWT) into incoming requests
  const accessToken =
    (req.headers['remote-accesstoken'] as string | undefined) ??
    (req.headers['x-access-token'] as string | undefined) ??
    (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '') ??
    null;

  console.log('[auth] bflUser:', user, '| hasAccessToken:', !!accessToken);
  return { bflUser: user, accessToken };
}

// Map app name → Ollama variant for auto-configuration
const OLLAMA_VARIANTS: Record<string, { variant: 'cpu' | 'gpu'; svcName: string; port: number }> = {
  'ollama-cpu': { variant: 'cpu', svcName: 'ollama-cpu-svc', port: 11434 },
  'ollama':     { variant: 'gpu', svcName: 'ollama-svc',     port: 11434 },
};

// POST /api/apps/:name/install   body: { repoUrl }
router.post('/:name/install', async (req, res) => {
  try {
    const { bflUser, accessToken } = getAuthInfo(req);
    const { result, generatedEnvs } = await installApp(req.params.name, req.body.repoUrl, bflUser, accessToken);
    console.log('[install] result:', JSON.stringify(result));

    const username = getOlaresUsername();

    // Auto-configure Ollama variant + endpoint after successful install
    const ollamaInfo = OLLAMA_VARIANTS[req.params.name];
    if (ollamaInfo) {
      const ep = `http://${ollamaInfo.svcName}.${req.params.name}-${username}:${ollamaInfo.port}`;
      setVariant(ollamaInfo.variant);
      setConnection(ep);
      console.log(`[install] auto-configured ollama: variant=${ollamaInfo.variant}, endpoint=${ep}`);
    }

    // Auto-configure OpenClaw connection after successful install
    if (req.params.name === 'openclaw' && generatedEnvs.OPENCLAW_GATEWAY_TOKEN) {
      const ep = `http://openclaw-svc.openclaw-${username}:18789`;
      setOpenclawConnection(ep, generatedEnvs.OPENCLAW_GATEWAY_TOKEN);
      console.log(`[install] auto-configured openclaw: endpoint=${ep}`);
    }

    res.json(result);
  } catch (err) {
    console.error('[install] error:', String(err));
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/apps/:name/uninstall
router.post('/:name/uninstall', async (req, res) => {
  const appName = req.params.name;

  // Always clear local config regardless of app-service result,
  // so a failed install doesn't leave the card in a deadlocked state.
  function clearLocalConfig() {
    if (appName === 'openclaw') {
      clearOpenclawConfig();
      console.log('[uninstall] cleared openclaw config and wizard state');
    }
    if (OLLAMA_VARIANTS[appName]) {
      setVariant(null);
      setConnection('');
      console.log('[uninstall] cleared ollama variant and endpoint');
    }
  }

  try {
    const { bflUser, accessToken } = getAuthInfo(req);
    const result = await uninstallApp(appName, bflUser, accessToken);
    clearLocalConfig();
    res.json(result);
  } catch (err) {
    const msg = String(err);
    console.error('[uninstall] error:', msg);
    clearLocalConfig();
    // "uninstalled state" means the app is already gone — treat as success
    if (msg.includes('uninstalled state') || msg.includes('not installed')) {
      console.log('[uninstall] app already uninstalled, treating as success');
      res.json({ code: 200, message: 'already uninstalled' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
