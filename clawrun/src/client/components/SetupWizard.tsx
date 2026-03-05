import React, { useState, useEffect } from 'react';
import { StepIndicator } from './StepIndicator';
import { StepProviders } from './wizard/StepProviders';
import { StepDefaultModel } from './wizard/StepDefaultModel';
import { StepChannels } from './wizard/StepChannels';
import { WIZARD_STEPS, PROVIDERS, CHANNELS } from './wizard/constants';
import { initialWizardState } from './wizard/types';
import type { WizardState } from './wizard/types';

const LAST_STEP = WIZARD_STEPS.length - 1; // 2

interface Props {
  open: boolean;
  onClose: () => void;
  ollamaHealthy: boolean;
  ollamaEndpoint: string | null;
}

export function SetupWizard({ open, onClose, ollamaHealthy, ollamaEndpoint }: Props) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [configuredEnvVars, setConfiguredEnvVars] = useState<string[]>([]);

  // Auto-populate Ollama Base URL when Ollama is healthy and field is empty
  useEffect(() => {
    if (ollamaHealthy && ollamaEndpoint && !state.ollama.baseUrl) {
      setState((s) => ({
        ...s,
        ollama: { ...s.ollama, baseUrl: ollamaEndpoint },
      }));
    }
  }, [ollamaHealthy, ollamaEndpoint]);

  // Load which API key env vars are already configured on the OpenClaw Deployment
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetch('/api/openclaw/env')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setConfiguredEnvVars(data.configured ?? []);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [open]);

  async function handleFinish() {
    setSaving(true);
    setError('');

    try {
      // 1. Apply OpenClaw config BEFORE env patch (env patch triggers pod restart)
      const configEntries: { key: string; value: unknown }[] = [];

      // Default model
      if (state.defaultModel.trim()) {
        configEntries.push({ key: 'agents.defaults.model', value: state.defaultModel.trim() });
      }

      // Ollama provider config (must set complete provider object — OpenClaw validates models array)
      if (state.useOllama && state.ollama.baseUrl) {
        configEntries.push({
          key: 'models.providers.ollama',
          value: {
            baseUrl: state.ollama.baseUrl,
            apiKey: state.ollama.apiKey || 'ollama',
            models: [],
          },
        });
      }

      // Channel configs
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
        if (!res.ok) {
          throw new Error(`OpenClaw 配置写入失败: ${res.status}`);
        }
      }

      // 2. Patch API keys as env vars on OpenClaw Deployment (triggers pod restart)
      const envPatch: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const key = state.providers[p.id]?.trim();
        if (key) {
          envPatch[p.envVar] = key;
        }
      }
      // Enable Ollama provider via env var
      if (state.useOllama) {
        envPatch['OLLAMA_API_KEY'] = state.ollama.apiKey || 'ollama';
      }

      // 2b. Patch OpenClaw deployment to bypass outbound Envoy for Ollama (port 11434)
      // Must happen BEFORE env patch — env patch triggers pod restart that picks up new command.
      if (state.useOllama) {
        await fetch('/api/openclaw/patch-bypass', { method: 'POST' });
      }

      if (Object.keys(envPatch).length > 0) {
        const res = await fetch('/api/openclaw/env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envs: envPatch }),
        });
        if (!res.ok) {
          throw new Error(`API Key 配置失败: ${res.status}`);
        }
      }

      // 3. Patch Ollama deployment to bypass inbound Envoy
      if (state.useOllama) {
        await fetch('/api/ollama/patch-bypass', { method: 'POST' });
      }

      // Mark wizard complete
      await fetch('/api/openclaw/wizard-complete', { method: 'POST' });

      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">OpenClaw 初始配置</h2>
          <p className="text-xs text-gray-400 mt-1">{WIZARD_STEPS[step].description}</p>
          <StepIndicator
            steps={WIZARD_STEPS}
            current={step}
            onStepClick={(i) => setStep(i)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 0 && (
            <StepProviders
              state={state}
              onChange={setState}
              configuredEnvVars={configuredEnvVars}
              ollamaHealthy={ollamaHealthy}
              ollamaEndpoint={ollamaEndpoint}
            />
          )}
          {step === 1 && <StepDefaultModel state={state} onChange={setState} ollamaHealthy={ollamaHealthy} />}
          {step === 2 && <StepChannels state={state} onChange={setState} />}

          {error && (
            <p className="text-sm text-red-500 mt-3">{error}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t flex justify-between">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
            className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {step > 0 ? '上一步' : '取消'}
          </button>
          <div className="flex gap-2">
            {step < LAST_STEP && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-4 py-2 text-sm text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
              >
                跳过
              </button>
            )}
            <button
              type="button"
              onClick={() => (step < LAST_STEP ? setStep(step + 1) : handleFinish())}
              disabled={saving}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {step < LAST_STEP ? '下一步' : saving ? '保存中…' : '完成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
