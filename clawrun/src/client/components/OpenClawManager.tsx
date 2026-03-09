import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../locales';
import { StepProviders } from './wizard/StepProviders';
import { StepDefaultModel } from './wizard/StepDefaultModel';
import { StepChannels } from './wizard/StepChannels';
import { ClawRouterCard } from './ClawRouterCard';
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
  if (replicas.desired > 0 && !healthy) return 'starting';
  return 'offline';
}

export function OpenClawManager({ status, onBack, refresh }: Props) {
  const { t } = useLocale();
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [configuredEnvVars, setConfiguredEnvVars] = useState<string[]>([]);
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
  const configDisabled = !isRunning;

  // Clear actionBusy when polled status confirms the state change
  const actionStartRef = useRef(0);
  useEffect(() => {
    if (!actionBusy) return;
    const real = deriveContainerState(status);
    const elapsed = Date.now() - actionStartRef.current;
    // For restart, require 5s before checking (pod hasn't started restarting yet)
    const minWait = actionBusy === 'restarting' ? 5000 : 0;
    // Only accept definitive states: 'stopped' (desired=0) confirms stop,
    // 'offline' (replicas=null) is a transient kubectl query failure — ignore it.
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
      const res = await fetch(`/api/openclaw/${action}`, { method: 'POST' });
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
      // 1. Config entries via kubectl exec
      const configEntries: { key: string; value: unknown }[] = [];

      if (state.defaultModel.trim()) {
        // ClawRouter requires model as object { primary: "..." }, not a plain string
        const modelValue = state.useClawRouter
          ? { primary: state.defaultModel.trim() }
          : state.defaultModel.trim();
        configEntries.push({ key: 'agents.defaults.model', value: modelValue });
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
        await fetch('/api/openclaw/pending-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: configEntries }),
        });
      }

      // 2. Store pending env vars on server (applied on next restart)
      const envPatch: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const key = state.providers[p.id]?.trim();
        if (state.useOllama || state.useClawRouter) {
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

      if (needsEnvPatch || state.useOllama || state.useClawRouter) {
        await fetch('/api/openclaw/pending-env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envs: envPatch, patchBypass: needsBypass }),
        });
      }

      // Mark wizard complete (in case first time)
      await fetch('/api/openclaw/wizard-complete', { method: 'POST' });

      setSuccess(t('manager.configSaved'));
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
  const stateKeyMap: Record<ContainerState, string> = {
    running:    'status.running',
    stopped:    'status.stopped',
    starting:   'status.starting',
    stopping:   'status.stopping',
    restarting:  'status.restarting',
    offline:    'status.offline',
  };
  const stateColorMap: Record<ContainerState, string> = {
    running:    'bg-green-100 text-green-700',
    stopped:    'bg-gray-200 text-gray-600',
    starting:   'bg-amber-100 text-amber-700',
    stopping:   'bg-amber-100 text-amber-700',
    restarting:  'bg-amber-100 text-amber-700',
    offline:    'bg-gray-200 text-gray-500',
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
        <h2 className="text-lg font-bold text-gray-800">{t('manager.title')}</h2>
      </div>

      {/* Two-column layout: left (status/plugins) + right (config) */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column — sticky on large screens */}
        <div className="w-full lg:w-2/5 space-y-4 lg:self-start lg:sticky lg:top-4">
          {/* Container Controls */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold text-base">{t('manager.containerState')}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${stateColorMap[containerState]}`}>
                {isBusy && <Spinner />}
                {t(stateKeyMap[containerState])}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAction('start')}
                disabled={isRunning || isBusy}
                className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('manager.start')}
              </button>
              <button
                onClick={() => handleAction('stop')}
                disabled={isStopped || isBusy}
                className="flex-1 px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('manager.stop')}
              </button>
              <button
                onClick={() => handleAction('restart')}
                disabled={!isRunning || isBusy}
                className="flex-1 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('manager.restart')}
              </button>
            </div>
            {isRunning && (
              <>
                <div className="border-t my-3" />
                <button
                  onClick={openUI}
                  className="w-full px-4 py-1.5 text-sm border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  {t('manager.openUI')}
                </button>
              </>
            )}
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          </div>

          {/* Plugins Card */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-base mb-4">{t('manager.plugins')}</h3>
            <ClawRouterCard
              installed={status.clawrouter.installed}
              openclawRunning={isRunning}
              onRefresh={refresh}
            />
            {/* Future plugins: add <div className="border-t my-4" /> then next plugin card */}
          </div>
        </div>

        {/* Right column — config */}
        <div className={`w-full lg:w-3/5 space-y-4 ${configDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {configDisabled && (
            <p className="text-sm text-gray-400">
              {t('manager.configUnavailable')}
            </p>
          )}

          {/* Section 1: Providers */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">{t('manager.modelServices')}</h3>
            <StepProviders
              state={state}
              onChange={setState}
              configuredEnvVars={configuredEnvVars}
              ollamaHealthy={status.ollama.healthy}
              ollamaEndpoint={status.ollama.endpoint}
              clawRouterInstalled={status.clawrouter.installed}
            />
          </div>

          {/* Section 2: Default Model */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">{t('manager.defaultModel')}</h3>
            <StepDefaultModel
              state={state}
              onChange={setState}
              ollamaHealthy={status.ollama.healthy}
            />
          </div>

          {/* Section 3: Channels */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">{t('manager.messageChannels')}</h3>
            <StepChannels state={state} onChange={setState} />
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || configDisabled}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? t('common.saving') : t('manager.saveConfig')}
            </button>
            {success && <p className="text-sm text-green-600">{success}</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
