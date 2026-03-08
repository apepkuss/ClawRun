import React, { useState, useEffect, useRef } from 'react';
import { StepProviders } from './wizard/StepProviders';
import { StepDefaultModel } from './wizard/StepDefaultModel';
import { StepChannels } from './wizard/StepChannels';
import { PROVIDERS, CHANNELS } from './wizard/constants';
import { initialWizardState } from './wizard/types';
import type { WizardState } from './wizard/types';
import type { AppStatus } from '../hooks/useAppStatus';

interface Props {
  status: AppStatus;
  onBack: () => void;
  refresh: () => void;
}

type ContainerState = 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'offline';

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function deriveContainerState(status: AppStatus): ContainerState {
  const { healthy, replicas } = status.openclaw;
  if (!replicas) return 'offline';
  if (replicas.desired === 0) return 'stopped';
  if (replicas.desired > 0 && replicas.ready > 0 && healthy) return 'running';
  if (replicas.desired > 0 && replicas.ready === 0) return 'starting';
  // desired > 0, ready > 0 but not healthy — could be restarting
  if (replicas.desired > 0 && !healthy) return 'starting';
  return 'offline';
}

export function OpenClawManager({ status, onBack, refresh }: Props) {
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [configuredEnvVars, setConfiguredEnvVars] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingEnv, setPendingEnv] = useState<{ envs: Record<string, string>; patchBypass: boolean } | null>(null);

  const containerState = actionBusy
    ? (actionBusy as ContainerState)
    : deriveContainerState(status);

  const isRunning = containerState === 'running';
  const isStopped = containerState === 'stopped';
  const isBusy = containerState === 'starting' || containerState === 'stopping' || containerState === 'restarting';
  const configDisabled = !isRunning;

  // Clear actionBusy when polled status confirms the state change
  const actionStartRef = useRef(0);
  useEffect(() => {
    if (!actionBusy) return;
    const real = deriveContainerState(status);
    const elapsed = Date.now() - actionStartRef.current;
    // For restart, require at least 5s before checking (pod hasn't started restarting yet)
    const minWait = actionBusy === 'restarting' ? 5000 : 0;
    if (elapsed >= minWait && (
      (actionBusy === 'stopping' && (real === 'stopped' || real === 'offline')) ||
      (actionBusy === 'starting' && real === 'running') ||
      (actionBusy === 'restarting' && real === 'running')
    )) {
      setActionBusy(null);
      return;
    }
    // Safety timeout: clear after 60s regardless
    const remaining = Math.max(60000 - elapsed, 0);
    const timer = setTimeout(() => { setActionBusy(null); refresh(); }, remaining);
    return () => clearTimeout(timer);
  }, [status, actionBusy]);

  // Load configured env vars
  useEffect(() => {
    if (!isRunning) return;
    fetch('/api/openclaw/env')
      .then((res) => res.json())
      .then((data) => setConfiguredEnvVars(data.configured ?? []))
      .catch(() => {});
  }, [isRunning]);

  async function handleAction(action: 'start' | 'stop' | 'restart') {
    const labelMap = { start: 'starting', stop: 'stopping', restart: 'restarting' } as const;
    actionStartRef.current = Date.now();
    setActionBusy(labelMap[action]);
    setError('');
    setSuccess('');
    try {
      // On restart, apply any pending env patch first (this triggers pod restart by itself)
      if (action === 'restart' && pendingEnv) {
        if (pendingEnv.patchBypass) {
          await fetch('/api/openclaw/patch-bypass', { method: 'POST' });
        }
        if (Object.keys(pendingEnv.envs).length > 0) {
          const res = await fetch('/api/openclaw/env', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envs: pendingEnv.envs }),
          });
          if (!res.ok) throw new Error(`API Key 配置失败: ${res.status}`);
          // env patch already triggers pod restart, no need to call restart API
          setPendingEnv(null);
          refresh();
          return;
        }
        setPendingEnv(null);
      }
      const res = await fetch(`/api/openclaw/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${action} failed: ${res.status}`);
      refresh();
      // actionBusy is cleared by the useEffect above when status reflects the change
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
      // 1. Config entries via kubectl exec
      const configEntries: { key: string; value: unknown }[] = [];

      if (state.defaultModel.trim()) {
        configEntries.push({ key: 'agents.defaults.model', value: state.defaultModel.trim() });
      }

      if (state.useOllama) {
        const baseUrl = state.ollama.baseUrl || status.ollama.endpoint || '';
        if (baseUrl) {
          configEntries.push({
            key: 'models.providers.ollama',
            value: { baseUrl, apiKey: state.ollama.apiKey || 'ollama', models: [] },
          });
        }
      }

      for (const ch of CHANNELS) {
        const vals = state.channels[ch.id];
        if (!vals) continue;
        for (const f of ch.fields) {
          const v = vals[f.key]?.trim();
          if (v) {
            configEntries.push({ key: f.configKey, value: v });
          }
        }
      }

      if (configEntries.length > 0) {
        const res = await fetch('/api/openclaw/config/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: configEntries }),
        });
        if (!res.ok) throw new Error(`配置写入失败: ${res.status}`);
      }

      // 2. Collect env vars (API keys) — defer actual patch to restart
      const envPatch: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const key = state.providers[p.id]?.trim();
        if (state.useOllama) {
          // When Ollama is enabled, clear all cloud API keys to avoid conflicts
          envPatch[p.envVar] = key || '';
        } else if (key) {
          envPatch[p.envVar] = key;
        }
      }
      if (state.useOllama) {
        envPatch['OLLAMA_API_KEY'] = state.ollama.apiKey || 'ollama';
      }

      const needsEnvPatch = Object.keys(envPatch).length > 0;
      const needsBypass = state.useOllama;

      if (needsEnvPatch || needsBypass) {
        setPendingEnv({ envs: envPatch, patchBypass: needsBypass });
      }

      // Mark wizard complete (in case first time)
      await fetch('/api/openclaw/wizard-complete', { method: 'POST' });

      setSuccess(needsEnvPatch
        ? '配置已保存。点击"重启"以应用 API Key 变更。'
        : '配置已保存。点击"重启"使配置生效。');
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function openUI() {
    let url = status.openclaw.uiUrl ?? status.openclaw.endpoint ?? '';
    if (url && status.openclaw.token) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}token=${encodeURIComponent(status.openclaw.token)}`;
    }
    window.open(url, '_blank');
  }

  // Container state badge
  const stateConfig: Record<ContainerState, { text: string; color: string }> = {
    running:    { text: '运行中', color: 'bg-green-100 text-green-700' },
    stopped:    { text: '已停止', color: 'bg-gray-200 text-gray-600' },
    starting:   { text: '启动中…', color: 'bg-amber-100 text-amber-700' },
    stopping:   { text: '停止中…', color: 'bg-amber-100 text-amber-700' },
    restarting:  { text: '重启中…', color: 'bg-amber-100 text-amber-700' },
    offline:    { text: '离线', color: 'bg-gray-200 text-gray-500' },
  };
  const badge = stateConfig[containerState];

  return (
    <div className="space-y-6">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; 返回
        </button>
        <h2 className="text-lg font-bold text-gray-800">OpenClaw 管理</h2>
      </div>

      {/* Container Controls */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-base">容器状态</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${badge.color}`}>
              {isBusy && <Spinner />}
              {badge.text}
            </span>
          </div>
          {isRunning && (
            <button
              onClick={openUI}
              className="px-4 py-1.5 text-sm border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              打开 OpenClaw UI
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('start')}
            disabled={isRunning || isBusy}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            启动
          </button>
          <button
            onClick={() => handleAction('stop')}
            disabled={isStopped || isBusy}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            停止
          </button>
          <button
            onClick={() => handleAction('restart')}
            disabled={!isRunning || isBusy}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            重启
          </button>
        </div>
      </div>

      {/* Config Sections */}
      <div className={configDisabled ? 'opacity-50 pointer-events-none' : ''}>
        {configDisabled && (
          <p className="text-sm text-gray-400 mb-4">
            OpenClaw 未运行，配置不可用。请先启动容器。
          </p>
        )}

        {/* Section 1: Providers */}
        <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">模型服务</h3>
          <StepProviders
            state={state}
            onChange={setState}
            configuredEnvVars={configuredEnvVars}
            ollamaHealthy={status.ollama.healthy}
            ollamaEndpoint={status.ollama.endpoint}
          />
        </div>

        {/* Section 2: Default Model */}
        <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">默认模型</h3>
          <StepDefaultModel
            state={state}
            onChange={setState}
            ollamaHealthy={status.ollama.healthy}
          />
        </div>

        {/* Section 3: Channels */}
        <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">消息通道</h3>
          <StepChannels state={state} onChange={setState} />
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || configDisabled}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
          {success && <p className="text-sm text-green-600">{success}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
