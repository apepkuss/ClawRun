import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import {
  getDeploymentEnvVar,
  getDeploymentEnvVars,
  patchDeploymentEnvVars,
  patchConfigMapData,
  getConfigMapData,
} from './k8s';

const CONFIG_FILE = '/app/data/config.json';

// ---------------------------------------------------------------------------
// Config persistence (stored in ClawRun's config.json alongside openclaw/ollama)
// ---------------------------------------------------------------------------

export interface LiteLLMConfig {
  endpoint: string;
  masterKey: string;
  routingProfile?: string; // auto | eco | premium | custom
  tiers?: Record<string, string>; // { SIMPLE: "ollama/...", MEDIUM: "...", ... }
  tierBoundaries?: Record<string, number>;
}

function loadConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(update: Record<string, unknown>) {
  try {
    const current = loadConfig();
    const merged = { ...current, ...update };
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.error('[litellm] saveConfig failed:', err);
  }
}

export function getLiteLLMConfig(): LiteLLMConfig | null {
  const cfg = loadConfig();
  return (cfg.litellm as LiteLLMConfig) ?? null;
}

export function saveLiteLLMConfig(litellm: LiteLLMConfig) {
  saveConfig({ litellm });
}

export function clearLiteLLMConfig() {
  const cfg = loadConfig();
  delete cfg.litellm;
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ---------------------------------------------------------------------------
// Namespace / endpoint helpers
// ---------------------------------------------------------------------------

function ns(username: string): string {
  return `litellm-${username}`;
}

export function getEndpoint(username: string): string {
  return `http://litellm-svc.${ns(username)}:4000`;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkHealth(username: string): Promise<boolean> {
  const endpoint = getEndpoint(username);
  return new Promise((resolve) => {
    exec(
      `wget -q -S --timeout=5 "${endpoint}/health/liveliness" -O /dev/null 2>&1`,
      { timeout: 6000 },
      (_err, stdout) => {
        resolve(stdout.includes('HTTP/'));
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Replica info
// ---------------------------------------------------------------------------

export async function getReplicaInfo(username: string): Promise<{ desired: number; ready: number } | null> {
  const namespace = ns(username);
  return new Promise((resolve) => {
    exec(
      `kubectl get deploy/litellm -n ${namespace} -o jsonpath='{.spec.replicas} {.status.readyReplicas}'`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const parts = stdout.replace(/'/g, '').trim().split(' ');
        const desired = parseInt(parts[0], 10) || 0;
        const ready = parseInt(parts[1], 10) || 0;
        resolve({ desired, ready });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Start / Stop / Restart
// ---------------------------------------------------------------------------

export async function stopDeploy(username: string): Promise<boolean> {
  const namespace = ns(username);
  return new Promise((resolve) => {
    exec(`kubectl scale deploy/litellm -n ${namespace} --replicas=0`, { timeout: 15000 }, (err, _stdout, stderr) => {
      if (err) {
        console.error('[litellm] scale to 0 failed:', stderr || err.message);
        resolve(false);
        return;
      }
      console.log(`[litellm] scaled to 0 (ns=${namespace})`);
      resolve(true);
    });
  });
}

export async function startDeploy(username: string): Promise<boolean> {
  const namespace = ns(username);
  return new Promise((resolve) => {
    exec(`kubectl scale deploy/litellm -n ${namespace} --replicas=1`, { timeout: 15000 }, (err, _stdout, stderr) => {
      if (err) {
        console.error('[litellm] scale to 1 failed:', stderr || err.message);
        resolve(false);
        return;
      }
      console.log(`[litellm] scaled to 1 (ns=${namespace})`);
      resolve(true);
    });
  });
}

export async function restartDeploy(username: string): Promise<boolean> {
  const namespace = ns(username);
  return new Promise((resolve) => {
    exec(`kubectl rollout restart deploy/litellm -n ${namespace}`, { timeout: 15000 }, (err, _stdout, stderr) => {
      if (err) {
        console.error('[litellm] rollout restart failed:', stderr || err.message);
        resolve(false);
        return;
      }
      console.log(`[litellm] rollout restart ok (ns=${namespace})`);
      resolve(true);
    });
  });
}

// ---------------------------------------------------------------------------
// API Key management (via K8s Deployment env patch)
// ---------------------------------------------------------------------------

export async function getApiKeyStatus(username: string): Promise<string[]> {
  const namespace = ns(username);
  const envs = await getDeploymentEnvVars(namespace, 'litellm', 'litellm');
  if (!envs) return [];
  // Return names of env vars that have non-empty values (exclude internal keys)
  const providerKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'ZHIPUAI_API_KEY', 'MOONSHOT_API_KEY', 'MINIMAX_API_KEY'];
  return providerKeys.filter((k) => envs[k] && envs[k].length > 0);
}

export async function setApiKeys(username: string, keys: Record<string, string>): Promise<boolean> {
  const namespace = ns(username);
  // LiteLLM has no init container that needs env vars — patch main container only
  return patchDeploymentEnvVars(namespace, 'litellm', 'litellm', keys);
}

// ---------------------------------------------------------------------------
// Master key sync
// ---------------------------------------------------------------------------

let lastMasterKeySync = 0;
const MASTER_KEY_SYNC_INTERVAL = 5 * 60 * 1000;

export async function autoSyncMasterKey(username: string): Promise<void> {
  const cfg = getLiteLLMConfig();
  if (cfg?.masterKey && Date.now() - lastMasterKeySync < MASTER_KEY_SYNC_INTERVAL) return;

  const namespace = ns(username);
  const mk = await getDeploymentEnvVar(namespace, 'litellm', 'PROXY_MASTER_KEY');
  if (!mk) return;

  lastMasterKeySync = Date.now();
  if (cfg?.masterKey === mk) return;

  const endpoint = cfg?.endpoint || getEndpoint(username);
  saveLiteLLMConfig({ ...cfg, endpoint, masterKey: mk } as LiteLLMConfig);
  console.log(`[litellm] synced master key from K8s deployment (ns=${namespace})`);
}

// ---------------------------------------------------------------------------
// ConfigMap management (routing config)
// ---------------------------------------------------------------------------

export interface RoutingConfig {
  routingProfile: string;
  tiers: Record<string, string>;
  tierBoundaries: Record<string, number>;
  ollamaEndpoint?: string;
}

const DEFAULT_TIERS: Record<string, string> = {
  SIMPLE: 'ollama/qwen2.5:0.5b',
  MEDIUM: 'deepseek/deepseek-chat',
  COMPLEX: 'anthropic/claude-sonnet-4-6',
  REASONING: 'openai/o3',
};

const DEFAULT_TIER_BOUNDARIES: Record<string, number> = {
  simple_medium: 0.15,
  medium_complex: 0.35,
  complex_reasoning: 0.60,
};

/**
 * Build a LiteLLM proxy_config.yaml from the routing config.
 * Only includes models whose provider API key is available.
 */
export function buildProxyConfigYaml(
  routing: RoutingConfig,
  configuredKeys: string[],
  ollamaEndpoint?: string,
): string {
  const modelList: string[] = [];
  const addedModels = new Set<string>();

  // Helper: check if a model's provider key is configured
  const isModelAvailable = (modelId: string): boolean => {
    if (modelId.startsWith('ollama/')) return true; // Ollama doesn't need API key
    if (modelId.startsWith('openai/')) return configuredKeys.includes('OPENAI_API_KEY');
    if (modelId.startsWith('anthropic/')) return configuredKeys.includes('ANTHROPIC_API_KEY');
    if (modelId.startsWith('deepseek/')) return configuredKeys.includes('DEEPSEEK_API_KEY');
    if (modelId.startsWith('google/') || modelId.startsWith('gemini/')) return configuredKeys.includes('GEMINI_API_KEY');
    if (modelId.startsWith('zhipu/') || modelId.startsWith('zai/')) return configuredKeys.includes('ZHIPUAI_API_KEY');
    if (modelId.startsWith('moonshot/')) return configuredKeys.includes('MOONSHOT_API_KEY');
    if (modelId.startsWith('minimax/')) return configuredKeys.includes('MINIMAX_API_KEY');
    return false;
  };

  // Helper: generate model entry YAML
  const addModel = (modelId: string) => {
    if (addedModels.has(modelId)) return;
    addedModels.add(modelId);

    if (modelId.startsWith('ollama/')) {
      const base = ollamaEndpoint || 'http://localhost:11434';
      const ollamaModel = modelId.replace('ollama/', '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: ollama_chat/${ollamaModel}\n` +
        `      api_base: ${base}`,
      );
    } else if (modelId.startsWith('openai/')) {
      const name = modelId.replace('openai/', '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: openai/${name}\n` +
        `      api_key: os.environ/OPENAI_API_KEY`,
      );
    } else if (modelId.startsWith('anthropic/')) {
      const name = modelId.replace('anthropic/', '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: anthropic/${name}\n` +
        `      api_key: os.environ/ANTHROPIC_API_KEY`,
      );
    } else if (modelId.startsWith('deepseek/')) {
      const name = modelId.replace('deepseek/', '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: deepseek/${name}\n` +
        `      api_key: os.environ/DEEPSEEK_API_KEY`,
      );
    } else if (modelId.startsWith('google/') || modelId.startsWith('gemini/')) {
      const name = modelId.replace(/^(google|gemini)\//, '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: gemini/${name}\n` +
        `      api_key: os.environ/GEMINI_API_KEY`,
      );
    } else if (modelId.startsWith('zhipu/') || modelId.startsWith('zai/')) {
      const name = modelId.replace(/^(zhipu|zai)\//, '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: zai/${name}\n` +
        `      api_key: os.environ/ZHIPUAI_API_KEY`,
      );
    } else if (modelId.startsWith('moonshot/')) {
      const name = modelId.replace('moonshot/', '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: moonshot/${name}\n` +
        `      api_key: os.environ/MOONSHOT_API_KEY`,
      );
    } else if (modelId.startsWith('minimax/')) {
      const name = modelId.replace('minimax/', '');
      modelList.push(
        `  - model_name: ${modelId}\n` +
        `    litellm_params:\n` +
        `      model: minimax/${name}\n` +
        `      api_key: os.environ/MINIMAX_API_KEY`,
      );
    }
  };

  // Collect available tier models
  const availableTiers: Record<string, string> = {};
  for (const [tier, modelId] of Object.entries(routing.tiers)) {
    if (isModelAvailable(modelId)) {
      availableTiers[tier] = modelId;
      addModel(modelId);
    }
  }

  // Build complexity router config
  const tierLines = Object.entries(availableTiers)
    .map(([tier, model]) => `          ${tier}: ${model}`)
    .join('\n');

  const boundaryLines = Object.entries(routing.tierBoundaries)
    .map(([key, val]) => `          ${key}: ${val}`)
    .join('\n');

  // Smart router entry
  const smartRouter =
    `  - model_name: smart-router\n` +
    `    litellm_params:\n` +
    `      model: auto_router/complexity_router\n` +
    `      complexity_router_config:\n` +
    `        tiers:\n${tierLines}\n` +
    `        tier_boundaries:\n${boundaryLines}`;

  const allModels = [smartRouter, ...modelList].join('\n');

  return (
    `model_list:\n` +
    `${allModels}\n` +
    `\n` +
    `litellm_settings:\n` +
    `  drop_params: true\n` +
    `\n` +
    `general_settings:\n` +
    `  master_key: os.environ/PROXY_MASTER_KEY\n`
  );
}

export async function getRoutingConfig(username: string): Promise<string | null> {
  const namespace = ns(username);
  const data = await getConfigMapData(namespace, 'litellm-config');
  if (!data) return null;
  return data['config.yaml'] ?? null;
}

export async function updateRoutingConfig(username: string, configYaml: string): Promise<boolean> {
  const namespace = ns(username);
  const ok = await patchConfigMapData(namespace, 'litellm-config', { 'config.yaml': configYaml });
  if (!ok) return false;
  // ConfigMap update requires pod restart to take effect
  return restartDeploy(username);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function getPresetTiers(profile: string): Record<string, string> {
  switch (profile) {
    case 'eco':
      return {
        SIMPLE: 'ollama/qwen2.5:0.5b',
        MEDIUM: 'ollama/qwen2.5:0.5b',
        COMPLEX: 'deepseek/deepseek-chat',
        REASONING: 'deepseek/deepseek-chat',
      };
    case 'premium':
      return {
        SIMPLE: 'deepseek/deepseek-chat',
        MEDIUM: 'anthropic/claude-sonnet-4-6',
        COMPLEX: 'anthropic/claude-sonnet-4-6',
        REASONING: 'openai/o3',
      };
    case 'auto':
    default:
      return { ...DEFAULT_TIERS };
  }
}

export { DEFAULT_TIERS, DEFAULT_TIER_BOUNDARIES };
