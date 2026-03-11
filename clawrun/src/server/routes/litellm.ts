import { Router } from 'express';
import * as litellm from '../services/litellm';
import * as openclaw from '../services/openclaw';
import { getOlaresUsername } from '../services/app-manager';

const router = Router();

// GET /api/litellm/config — read current routing config from ConfigMap
router.get('/config', async (_req, res) => {
  const username = getOlaresUsername();
  const configYaml = await litellm.getRoutingConfig(username);
  const localCfg = litellm.getLiteLLMConfig();
  res.json({
    configYaml: configYaml || null,
    routingProfile: localCfg?.routingProfile || 'auto',
    tiers: localCfg?.tiers || litellm.DEFAULT_TIERS,
    tierBoundaries: localCfg?.tierBoundaries || litellm.DEFAULT_TIER_BOUNDARIES,
  });
});

// POST /api/litellm/config — update routing config (patch ConfigMap + restart)
// body: { routingProfile, tiers, tierBoundaries, ollamaEndpoint? }
router.post('/config', async (req, res) => {
  const { routingProfile, tiers, tierBoundaries, ollamaEndpoint } = req.body as {
    routingProfile?: string;
    tiers?: Record<string, string>;
    tierBoundaries?: Record<string, number>;
    ollamaEndpoint?: string;
  };

  const username = getOlaresUsername();

  // Resolve tiers from preset or custom
  const profile = routingProfile || 'auto';
  const resolvedTiers = tiers || litellm.getPresetTiers(profile);
  const resolvedBoundaries = tierBoundaries || litellm.DEFAULT_TIER_BOUNDARIES;

  // Get configured API keys to determine which models are available
  const configuredKeys = await litellm.getApiKeyStatus(username);

  // Build and apply proxy config
  const configYaml = litellm.buildProxyConfigYaml(
    { routingProfile: profile, tiers: resolvedTiers, tierBoundaries: resolvedBoundaries, ollamaEndpoint },
    configuredKeys,
    ollamaEndpoint,
  );

  const ok = await litellm.updateRoutingConfig(username, configYaml);
  if (!ok) {
    res.status(500).json({ error: 'Failed to update routing config' });
    return;
  }

  // Persist locally for UI state restoration
  const localCfg = litellm.getLiteLLMConfig();
  litellm.saveLiteLLMConfig({
    ...localCfg!,
    routingProfile: profile,
    tiers: resolvedTiers,
    tierBoundaries: resolvedBoundaries,
  });

  res.json({ ok: true });
});

// GET /api/litellm/env — read which API key env vars are set
router.get('/env', async (_req, res) => {
  const username = getOlaresUsername();
  const configured = await litellm.getApiKeyStatus(username);
  res.json({ configured });
});

// POST /api/litellm/env — update API keys (patch Deployment env, triggers restart)
// body: { envs: Record<string, string> }
router.post('/env', async (req, res) => {
  const { envs } = req.body as { envs: Record<string, string> };
  if (!envs || Object.keys(envs).length === 0) {
    res.status(400).json({ error: 'envs is required' });
    return;
  }
  const username = getOlaresUsername();
  const ok = await litellm.setApiKeys(username, envs);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Failed to patch deployment env vars' });
  }
});

// POST /api/litellm/start
router.post('/start', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await litellm.startDeploy(username);
  res.json(ok ? { ok: true } : { error: 'Failed to start' });
});

// POST /api/litellm/stop
router.post('/stop', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await litellm.stopDeploy(username);
  res.json(ok ? { ok: true } : { error: 'Failed to stop' });
});

// POST /api/litellm/restart
router.post('/restart', async (_req, res) => {
  const username = getOlaresUsername();
  const ok = await litellm.restartDeploy(username);
  res.json(ok ? { ok: true } : { error: 'Failed to restart' });
});

// POST /api/litellm/connect-openclaw — register LiteLLM as OpenClaw provider
// Writes pending config to OpenClaw and triggers restart.
router.post('/connect-openclaw', async (_req, res) => {
  const username = getOlaresUsername();
  const cfg = litellm.getLiteLLMConfig();
  if (!cfg?.masterKey) {
    res.status(400).json({ error: 'LiteLLM master key not available' });
    return;
  }

  const endpoint = cfg.endpoint || litellm.getEndpoint(username);

  // Write OpenClaw pending config to register LiteLLM as a provider
  const entries = [
    {
      key: 'models.providers.litellm',
      value: JSON.stringify({
        baseUrl: `${endpoint}/v1`,
        apiKey: cfg.masterKey,
        api: 'openai-completions',
        models: [{
          id: 'smart-router',
          name: 'Smart Router (Auto)',
          contextWindow: 128000,
          maxTokens: 16384,
        }],
      }),
    },
    {
      key: 'agents.defaults.model',
      value: '"litellm/smart-router"',
    },
    {
      key: 'plugins.allow',
      value: '[]',
    },
  ];

  openclaw.setPendingConfig(entries);

  // Restart OpenClaw to apply the pending config
  const ok = await openclaw.restartDeploy(username);
  if (ok) {
    res.json({ ok: true, pendingRestart: true });
  } else {
    res.status(500).json({ error: 'Failed to restart OpenClaw' });
  }
});

export default router;
