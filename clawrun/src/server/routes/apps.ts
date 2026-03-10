import { Router, Request } from 'express';
import { installApp, uninstallApp, getOlaresUsername } from '../services/app-manager';
import { setConnection as setOpenclawConnection, clearConfig as clearOpenclawConfig } from '../services/openclaw';
import { saveLiteLLMConfig, clearLiteLLMConfig, getEndpoint as getLiteLLMEndpoint } from '../services/litellm';

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

// POST /api/apps/:name/install   body: { repoUrl }
router.post('/:name/install', async (req, res) => {
  try {
    const { bflUser, accessToken } = getAuthInfo(req);
    const { result, generatedEnvs } = await installApp(req.params.name, req.body.repoUrl, bflUser, accessToken);
    console.log('[install] result:', JSON.stringify(result));

    const username = getOlaresUsername();

    // Auto-configure OpenClaw connection after successful install
    if (req.params.name === 'openclaw' && generatedEnvs.OPENCLAW_GATEWAY_TOKEN) {
      const ep = `http://openclaw-svc.openclaw-${username}:18789`;
      setOpenclawConnection(ep, generatedEnvs.OPENCLAW_GATEWAY_TOKEN);
      console.log(`[install] auto-configured openclaw: endpoint=${ep}`);
    }

    // Auto-configure LiteLLM connection after successful install
    if (req.params.name === 'litellm' && generatedEnvs.LITELLM_MASTER_KEY) {
      const ep = getLiteLLMEndpoint(username);
      saveLiteLLMConfig({ endpoint: ep, masterKey: generatedEnvs.LITELLM_MASTER_KEY });
      console.log(`[install] auto-configured litellm: endpoint=${ep}`);
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

  function clearLocalConfig() {
    if (appName === 'openclaw') {
      clearOpenclawConfig();
      console.log('[uninstall] cleared openclaw config and wizard state');
    }
    if (appName === 'litellm') {
      clearLiteLLMConfig();
      console.log('[uninstall] cleared litellm config');
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
    if (msg.includes('uninstalled state') || msg.includes('not installed')) {
      console.log('[uninstall] app already uninstalled, treating as success');
      res.json({ code: 200, message: 'already uninstalled' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
