import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../locales';
import type { AppStatus } from '../hooks/useAppStatus';

interface Props {
  status: AppStatus;
  onBack: () => void;
  refresh: () => void;
}

type ContainerState = 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'offline';

const PRESETS: Record<string, Record<string, string>> = {
  eco: {
    SIMPLE: 'ollama/qwen2.5:0.5b',
    MEDIUM: 'ollama/qwen2.5:0.5b',
    COMPLEX: 'deepseek/deepseek-chat',
    REASONING: 'deepseek/deepseek-chat',
  },
  auto: {
    SIMPLE: 'ollama/qwen2.5:0.5b',
    MEDIUM: 'deepseek/deepseek-chat',
    COMPLEX: 'anthropic/claude-sonnet-4-6',
    REASONING: 'openai/o3',
  },
  premium: {
    SIMPLE: 'deepseek/deepseek-chat',
    MEDIUM: 'anthropic/claude-sonnet-4-6',
    COMPLEX: 'anthropic/claude-sonnet-4-6',
    REASONING: 'openai/o3',
  },
};

const TIER_LABELS = ['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'] as const;

const API_KEY_DEFS = [
  { envVar: 'OPENAI_API_KEY', label: 'OpenAI' },
  { envVar: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
  { envVar: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
  { envVar: 'GEMINI_API_KEY', label: 'Google Gemini' },
  { envVar: 'ZHIPUAI_API_KEY', label: '智谱 (Zhipu)' },
  { envVar: 'MOONSHOT_API_KEY', label: 'Moonshot (Kimi)' },
  { envVar: 'MINIMAX_API_KEY', label: 'MiniMax' },
];

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function deriveContainerState(status: AppStatus): ContainerState {
  const { healthy, replicas } = status.litellm;
  if (!replicas) return 'offline';
  if (replicas.desired === 0) return 'stopped';
  if (replicas.desired > 0 && replicas.ready > 0 && healthy) return 'running';
  if (replicas.desired > 0 && replicas.ready === 0) return 'starting';
  if (replicas.desired > 0 && !healthy) return 'starting';
  return 'offline';
}

export function LiteLLMManager({ status, onBack, refresh }: Props) {
  const { t } = useLocale();

  // Routing config state
  const [routingProfile, setRoutingProfile] = useState('auto');
  const [tiers, setTiers] = useState<Record<string, string>>({ ...PRESETS.auto });
  const [tierBoundaries, setTierBoundaries] = useState({
    simple_medium: 0.15,
    medium_complex: 0.35,
    complex_reasoning: 0.60,
  });

  // API keys state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [configuredKeys, setConfiguredKeys] = useState<string[]>([]);

  // Ollama
  const [useOllama, setUseOllama] = useState(true);
  const [connectOpenclaw, setConnectOpenclaw] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const containerState = actionBusy
    ? (actionBusy as ContainerState)
    : deriveContainerState(status);

  const isRunning = containerState === 'running';
  const isStopped = containerState === 'stopped';
  const isBusy = containerState === 'starting' || containerState === 'stopping' || containerState === 'restarting';

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  // Clear actionBusy when polled status confirms the state change
  const actionStartRef = useRef(0);
  useEffect(() => {
    if (!actionBusy) return;
    const real = deriveContainerState(status);
    const elapsed = Date.now() - actionStartRef.current;
    const minWait = actionBusy === 'restarting' ? 5000 : 0;
    if (elapsed >= minWait && (
      (actionBusy === 'stopping' && real === 'stopped') ||
      (actionBusy === 'starting' && real === 'running') ||
      (actionBusy === 'restarting' && real === 'running')
    )) {
      setActionBusy(null);
      return;
    }
    const remaining = Math.max(60000 - elapsed, 0);
    const timer = setTimeout(() => { setActionBusy(null); refresh(); }, remaining);
    return () => clearTimeout(timer);
  }, [status, actionBusy]);

  // Load existing config and API key status
  useEffect(() => {
    fetch('/api/litellm/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.routingProfile) setRoutingProfile(data.routingProfile);
        if (data.tiers) setTiers(data.tiers);
        if (data.tierBoundaries) setTierBoundaries(data.tierBoundaries);
      })
      .catch(() => {});

    fetch('/api/litellm/env')
      .then((res) => res.json())
      .then((data) => setConfiguredKeys(data.configured ?? []))
      .catch(() => {});
  }, [isRunning]);

  function handlePresetChange(preset: string) {
    setRoutingProfile(preset);
    if (preset !== 'custom') {
      setTiers({ ...(PRESETS[preset] || PRESETS.auto) });
    }
  }

  function updateTier(tier: string, value: string) {
    setTiers((prev) => ({ ...prev, [tier]: value }));
    setRoutingProfile('custom');
  }

  async function handleAction(action: 'start' | 'stop' | 'restart') {
    const labelMap = { start: 'starting', stop: 'stopping', restart: 'restarting' } as const;
    actionStartRef.current = Date.now();
    setActionBusy(labelMap[action]);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/litellm/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${action} failed: ${res.status}`);
      refresh();
    } catch (err) {
      setError(String(err));
      setActionBusy(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // 1. Update API keys (patch Deployment env)
      const envPatch: Record<string, string> = {};
      for (const def of API_KEY_DEFS) {
        const val = apiKeys[def.envVar]?.trim();
        if (val) envPatch[def.envVar] = val;
      }
      if (Object.keys(envPatch).length > 0) {
        const res = await fetch('/api/litellm/env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envs: envPatch }),
        });
        if (!res.ok) throw new Error('Failed to update API keys');
      }

      // 2. Update routing config (patch ConfigMap + restart)
      const ollamaEndpoint = useOllama && status.ollama.endpoint
        ? status.ollama.endpoint
        : undefined;

      const res = await fetch('/api/litellm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingProfile, tiers, tierBoundaries, ollamaEndpoint }),
      });
      if (!res.ok) throw new Error('Failed to update routing config');

      // 3. Register as OpenClaw provider if checked
      if (connectOpenclaw && status.openclaw.healthy) {
        const res = await fetch('/api/litellm/connect-openclaw', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to connect to OpenClaw');
      }

      setSuccess(t('litellm.saveSuccess'));
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const stateKeyMap: Record<ContainerState, string> = {
    running: 'status.running',
    stopped: 'status.stopped',
    starting: 'status.starting',
    stopping: 'status.stopping',
    restarting: 'status.restarting',
    offline: 'status.offline',
  };
  const stateColorMap: Record<ContainerState, string> = {
    running: 'bg-green-100 text-green-700',
    stopped: 'bg-gray-200 text-gray-600',
    starting: 'bg-amber-100 text-amber-700',
    stopping: 'bg-amber-100 text-amber-700',
    restarting: 'bg-amber-100 text-amber-700',
    offline: 'bg-gray-200 text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; {t('common.back')}
        </button>
        <h2 className="text-lg font-bold text-gray-800">{t('litellm.title')}</h2>
      </div>

      {/* Container Controls */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-base">{t('manager.containerState')}</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${stateColorMap[containerState]}`}>
              {isBusy && <Spinner />}
              {t(stateKeyMap[containerState])}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('start')}
            disabled={isRunning || isBusy}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('manager.start')}
          </button>
          <button
            onClick={() => handleAction('stop')}
            disabled={isStopped || isBusy}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('manager.stop')}
          </button>
          <button
            onClick={() => handleAction('restart')}
            disabled={!isRunning || isBusy}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('manager.restart')}
          </button>
        </div>
      </div>

      {/* Routing Strategy */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-3">{t('litellm.routingStrategy')}</h3>

        {/* Preset selector */}
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">{t('litellm.preset')}</label>
          <select
            value={routingProfile}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="eco">{t('litellm.presetEco')}</option>
            <option value="auto">{t('litellm.presetAuto')}</option>
            <option value="premium">{t('litellm.presetPremium')}</option>
            <option value="custom">{t('litellm.presetCustom')}</option>
          </select>
        </div>

        {/* Tier model selectors */}
        <div className="space-y-3">
          {TIER_LABELS.map((tier) => (
            <div key={tier}>
              <label className="block text-xs text-gray-500 mb-1">
                {t(`litellm.tier${tier.charAt(0) + tier.slice(1).toLowerCase()}`)}
              </label>
              <input
                type="text"
                value={tiers[tier] || ''}
                onChange={(e) => updateTier(tier, e.target.value)}
                placeholder="provider/model-name"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Score Boundaries */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-3">{t('litellm.scoreBoundaries')}</h3>
        <div className="space-y-3">
          {[
            { key: 'simple_medium', from: 'litellm.tierSimple', to: 'litellm.tierMedium' },
            { key: 'medium_complex', from: 'litellm.tierMedium', to: 'litellm.tierComplex' },
            { key: 'complex_reasoning', from: 'litellm.tierComplex', to: 'litellm.tierReasoning' },
          ].map(({ key, from, to }) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-xs text-gray-500 w-44">{t(from)} → {t(to)}</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={tierBoundaries[key as keyof typeof tierBoundaries]}
                onChange={(e) =>
                  setTierBoundaries((prev) => ({
                    ...prev,
                    [key]: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-24 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-3">{t('litellm.apiKeys')}</h3>
        <div className="space-y-3">
          {API_KEY_DEFS.map(({ envVar, label }) => (
            <div key={envVar}>
              <label className="block text-xs text-gray-500 mb-1">
                {label}
                {configuredKeys.includes(envVar) && (
                  <span className="ml-2 text-green-600 font-medium">{t('litellm.configured')}</span>
                )}
              </label>
              <input
                type="password"
                value={apiKeys[envVar] || ''}
                onChange={(e) => setApiKeys((prev) => ({ ...prev, [envVar]: e.target.value }))}
                placeholder={configuredKeys.includes(envVar) ? '********' : 'sk-...'}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Local Ollama */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-3">{t('litellm.localModels')}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useOllama}
            onChange={(e) => setUseOllama(e.target.checked)}
            className="rounded"
          />
          {t('litellm.useOllama')}
          {status.ollama.healthy ? (
            <span className="text-xs text-green-600">({t('litellm.detected')})</span>
          ) : (
            <span className="text-xs text-gray-400">({t('litellm.notDetected')})</span>
          )}
        </label>
        {useOllama && status.ollama.endpoint && (
          <p className="text-xs text-gray-400 mt-1 ml-6">
            Endpoint: {status.ollama.endpoint}
          </p>
        )}
      </div>

      {/* OpenClaw Connection */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-3">{t('litellm.openclawConnect')}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={connectOpenclaw}
            onChange={(e) => setConnectOpenclaw(e.target.checked)}
            className="rounded"
          />
          {t('litellm.autoRegister')}
        </label>
        {connectOpenclaw && (
          <p className="text-xs text-gray-400 mt-1 ml-6">
            {t('litellm.modelName')}: smart-router
          </p>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? t('common.saving') : t('litellm.saveAndRestart')}
        </button>
        {success && <p className="text-sm text-green-600">{success}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
