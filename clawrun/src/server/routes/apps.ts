import { Router, Request } from 'express';
import { installApp, uninstallApp } from '../services/app-manager';

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
    const result = await installApp(req.params.name, req.body.repoUrl, bflUser, accessToken);
    console.log('[install] result:', JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('[install] error:', String(err));
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/apps/:name/uninstall
router.post('/:name/uninstall', async (req, res) => {
  try {
    const { bflUser, accessToken } = getAuthInfo(req);
    const result = await uninstallApp(req.params.name, bflUser, accessToken);
    res.json(result);
  } catch (err) {
    console.error('[uninstall] error:', String(err));
    res.status(500).json({ error: String(err) });
  }
});

export default router;
