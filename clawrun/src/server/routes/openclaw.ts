import { Router } from 'express';
import * as openclaw from '../services/openclaw';
import * as clawrouter from '../services/clawrouter';
import { getOlaresUsername } from '../services/app-manager';

const router = Router();

// POST /api/openclaw/connect   body: { endpoint?, token?, uiUrl? }
// endpoint+token are optional if already configured; omitting them keeps existing values.
router.post('/connect', (req, res) => {
  const { endpoint, token, uiUrl } = req.body as { endpoint?: string; token?: string; uiUrl?: string };
  const existing = openclaw.getConnection();
  const ep = (endpoint ?? '').trim() || existing.endpoint;
  const tk = (token ?? '').trim() || existing.token;
  if (!ep || !tk) {
    res.status(400).json({ error: 'endpoint and token are required' });
    return;
  }
  openclaw.setConnection(ep, tk, uiUrl);
  res.json({ ok: true });
});

// GET /api/openclaw/health
router.get('/health', async (_req, res) => {
  const healthy = await openclaw.checkHealth();
  res.json({ healthy });
});

// POST /api/openclaw/config/batch   body: { entries: [{ key, value }] }
// Sets config via kubectl exec → `node dist/index.js config set` inside OpenClaw pod.
// Waits for all config sets to complete before responding.
router.post('/config/batch', async (req, res) => {
  const { entries } = req.body as { entries: { key: string; value: unknown }[] };
  if (!entries || entries.length === 0) {
    res.json({ ok: true });
    return;
  }
  const username = getOlaresUsername();
  // Run sequentially to avoid OOMKill — each config set spawns a full Node.js process
  let failed = 0;
  for (const entry of entries) {
    const val = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
    const ok = await openclaw.setConfigViaExec(username, entry.key, val);
    if (!ok) failed++;
  }
  if (failed > 0) {
    res.status(500).json({ error: `${failed}/${entries.length} config sets failed` });
  } else {
    res.json({ ok: true });
  }
});

// GET /api/openclaw/env — read which API key env vars are set on OpenClaw Deployment
router.get('/env', async (_req, res) => {
  const username = getOlaresUsername();
  const configured = await openclaw.getApiKeyStatus(username);
  res.json({ configured });
});

// POST /api/openclaw/env   body: { envs: Record<string, string> }
// Patch API key env vars on the OpenClaw Deployment (triggers pod restart)
router.post('/env', async (req, res) => {
  const { envs } = req.body as { envs: Record<string, string> };
  if (!envs || Object.keys(envs).length === 0) {
    res.status(400).json({ error: 'envs is required' });
    return;
  }
  const username = getOlaresUsername();
  const ok = await openclaw.setApiKeys(username, envs);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to patch deployment env vars' });
  }
});

// GET /api/openclaw/wizard-status
router.get('/wizard-status', (_req, res) => {
  res.json({ completed: openclaw.isWizardCompleted() });
});

// POST /api/openclaw/patch-bypass — patch OpenClaw deployment to add outbound Envoy bypass for Ollama
router.post('/patch-bypass', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await openclaw.patchOutboundBypass(username);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to patch OpenClaw deployment' });
  }
});

// POST /api/openclaw/stop — scale OpenClaw deployment to 0
router.post('/stop', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await openclaw.stopDeploy(username);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to stop OpenClaw deployment' });
  }
});

// POST /api/openclaw/start — scale OpenClaw deployment to 1
router.post('/start', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await openclaw.startDeploy(username);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to start OpenClaw deployment' });
  }
});

// POST /api/openclaw/restart — apply pending env (if any) and restart OpenClaw deployment
router.post('/restart', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await openclaw.applyPendingAndRestart(username);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to restart OpenClaw deployment' });
  }
});

// POST /api/openclaw/pending-env   body: { envs, patchBypass }
// Store pending env vars on the server; applied on next restart.
router.post('/pending-env', (req, res) => {
  const { envs, patchBypass } = req.body as { envs: Record<string, string>; patchBypass: boolean };
  openclaw.setPendingEnv({ envs: envs ?? {}, patchBypass: !!patchBypass });
  res.json({ ok: true });
});

// POST /api/openclaw/pending-config   body: { entries: [{ key, value }] }
// Store pending config entries; applied after restart when pod is running.
router.post('/pending-config', (req, res) => {
  const { entries } = req.body as { entries: { key: string; value: unknown }[] };
  const serialized = (entries ?? []).map((e) => ({
    key: e.key,
    value: typeof e.value === 'string' ? e.value : JSON.stringify(e.value),
  }));
  openclaw.setPendingConfig(serialized.length > 0 ? serialized : null);
  res.json({ ok: true });
});

// POST /api/openclaw/wizard-complete
router.post('/wizard-complete', (_req, res) => {
  openclaw.markWizardCompleted();
  res.json({ ok: true });
});

// ── ClawRouter Plugin ──

// GET /api/openclaw/plugins/clawrouter/status
router.get('/plugins/clawrouter/status', async (_req, res) => {
  const username = getOlaresUsername();
  const [pluginStatus, mnemonicBurned, hasWallet] = await Promise.all([
    clawrouter.getPluginStatus(username),
    clawrouter.isMnemonicBurned(username),
    clawrouter.walletExists(username),
  ]);
  const pending = openclaw.getPendingPlugin();
  let walletInfo: clawrouter.WalletInfo | null = null;
  if (pluginStatus.installed) {
    walletInfo = await clawrouter.getWalletInfo(username);
  }
  res.json({
    installed: pluginStatus.installed,
    pendingAction: pending?.action ?? null,
    walletAddress: walletInfo?.address ?? null,
    chain: walletInfo?.chain ?? null,
    mnemonicBurned,
    walletExists: hasWallet,
  });
});

// POST /api/openclaw/plugins/clawrouter/install
router.post('/plugins/clawrouter/install', async (_req, res) => {
  openclaw.setPendingPlugin({ action: 'install' });
  res.json({ ok: true, pendingRestart: true });
});

// POST /api/openclaw/plugins/clawrouter/uninstall
router.post('/plugins/clawrouter/uninstall', async (_req, res) => {
  openclaw.setPendingPlugin({ action: 'uninstall' });
  res.json({ ok: true, pendingRestart: true });
});

// GET /api/openclaw/plugins/clawrouter/wallet
router.get('/plugins/clawrouter/wallet', async (_req, res) => {
  const username = getOlaresUsername();
  const info = await clawrouter.getWalletInfo(username);
  if (info) {
    res.json(info);
  } else {
    res.json({ address: null, chain: null });
  }
});

// GET /api/openclaw/plugins/clawrouter/balance
router.get('/plugins/clawrouter/balance', async (_req, res) => {
  const username = getOlaresUsername();
  const balance = await clawrouter.getWalletBalance(username);
  if (balance) {
    res.json(balance);
  } else {
    res.json({ balance: null, currency: 'USDC' });
  }
});

// POST /api/openclaw/plugins/clawrouter/chain   body: { chain: 'base' | 'solana' }
router.post('/plugins/clawrouter/chain', async (req, res) => {
  const { chain } = req.body as { chain: string };
  const username = getOlaresUsername();
  const ok = await clawrouter.switchChain(username, chain);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Invalid chain. Must be "base" or "solana".' });
  }
});

// GET /api/openclaw/plugins/clawrouter/mnemonic
router.get('/plugins/clawrouter/mnemonic', async (_req, res) => {
  const username = getOlaresUsername();
  const mnemonic = await clawrouter.getMnemonic(username);
  if (mnemonic) {
    res.json({ mnemonic });
  } else {
    res.json({ mnemonic: null });
  }
});

// POST /api/openclaw/plugins/clawrouter/mnemonic/verify   body: { answers: [{position, word}] }
router.post('/plugins/clawrouter/mnemonic/verify', async (req, res) => {
  const { answers } = req.body as { answers: { position: number; word: string }[] };
  const username = getOlaresUsername();
  const mnemonic = await clawrouter.getMnemonic(username);
  if (!mnemonic) {
    res.status(400).json({ error: 'Mnemonic already burned or not available.' });
    return;
  }
  const ok = await clawrouter.verifyAndBurnMnemonic(username, mnemonic, answers);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Verification failed. Words do not match.' });
  }
});

// POST /api/openclaw/plugins/clawrouter/import-key   body: { privateKey: '0x...' }
router.post('/plugins/clawrouter/import-key', async (req, res) => {
  const { privateKey } = req.body as { privateKey: string };
  if (!privateKey) {
    res.status(400).json({ error: 'privateKey is required' });
    return;
  }
  const username = getOlaresUsername();
  // Check if wallet already exists
  const exists = await clawrouter.walletExists(username);
  if (exists) {
    // Allow import but warn — frontend should show confirmation dialog
    console.warn('[clawrouter] overwriting existing wallet key');
  }
  const ok = await clawrouter.importPrivateKey(username, privateKey);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Invalid private key format. Expected 0x + 64 hex characters.' });
  }
});

export default router;
