import React, { useState } from 'react';
import { PROVIDERS } from './constants';
import type { WizardState } from './types';

interface Props {
  state: WizardState;
  onChange: (s: WizardState) => void;
  configuredEnvVars: string[];
  ollamaHealthy: boolean;
  ollamaEndpoint: string | null;
}

export function StepProviders({ state, onChange, configuredEnvVars, ollamaHealthy, ollamaEndpoint }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // When Ollama is enabled, cloud provider section is dimmed (but keys are preserved)
  const cloudDisabled = state.useOllama;

  function setKey(providerId: string, value: string) {
    onChange({
      ...state,
      providers: { ...state.providers, [providerId]: value },
    });
  }

  function toggleOllama(enabled: boolean) {
    onChange({
      ...state,
      useOllama: enabled,
      // Clear cloud default model when switching to Ollama (incompatible model names)
      defaultModel: enabled ? '' : state.defaultModel,
      // Auto-populate baseUrl with detected endpoint when enabling
      ollama: {
        ...state.ollama,
        baseUrl: enabled && !state.ollama.baseUrl && ollamaEndpoint ? ollamaEndpoint : state.ollama.baseUrl,
      },
    });
  }

  function updateOllama(field: 'baseUrl' | 'apiKey', value: string) {
    onChange({
      ...state,
      ollama: { ...state.ollama, [field]: value },
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Cloud Providers ── */}
      <div className={cloudDisabled ? 'opacity-50 pointer-events-none' : ''}>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">云端服务商</h3>
        <p className="text-xs text-gray-400 mb-3">
          {cloudDisabled
            ? '已启用本地 Ollama，如需使用云端服务商请先关闭 Ollama 开关。'
            : '输入 API Key 后保存，点击重启使配置生效。'}
        </p>
        <div className="space-y-2">
          {PROVIDERS.map((p) => {
            const isOpen = expanded === p.id && !cloudDisabled;
            const hasNewKey = !!state.providers[p.id]?.trim();
            const isAlreadyConfigured = configuredEnvVars.includes(p.envVar);
            return (
              <div key={p.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => !cloudDisabled && setExpanded(isOpen ? null : p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700">{p.name}</span>
                  <div className="flex items-center gap-2">
                    {hasNewKey && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        待保存
                      </span>
                    )}
                    {!hasNewKey && isAlreadyConfigured && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        已配置
                      </span>
                    )}
                    <span className="text-gray-400 text-xs">{isOpen ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 border-t bg-gray-50">
                    <label className="block text-xs text-gray-500 mt-2 mb-1">API Key</label>
                    <input
                      type="password"
                      value={state.providers[p.id] ?? ''}
                      onChange={(e) => setKey(p.id, e.target.value)}
                      placeholder={isAlreadyConfigured ? '已配置（留空保持不变）' : `输入 ${p.name} API Key`}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t" />

      {/* ── Local Ollama ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">本地模型 (Ollama)</h3>
          {ollamaHealthy && (
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={state.useOllama}
                onChange={(e) => toggleOllama(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              <span className="ml-2 text-xs text-gray-500">{state.useOllama ? '已启用' : '未启用'}</span>
            </label>
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2.5 h-2.5 rounded-full ${ollamaHealthy ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-sm text-gray-600">
            Ollama 状态：{ollamaHealthy ? '运行中' : '离线'}
          </span>
        </div>

        {!ollamaHealthy ? (
          <p className="text-xs text-gray-400">
            Ollama 未运行。如需使用本地模型，请先从 Dashboard 安装 Ollama。
          </p>
        ) : state.useOllama ? (
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ollama Base URL</label>
              <input
                type="text"
                value={state.ollama.baseUrl}
                onChange={(e) => updateOllama('baseUrl', e.target.value)}
                placeholder={ollamaEndpoint ?? 'http://ollamarun-svc:11434'}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                OpenClaw 将通过此地址访问 Ollama，使用内网地址即可。
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key（可选）</label>
              <input
                type="text"
                value={state.ollama.apiKey}
                onChange={(e) => updateOllama('apiKey', e.target.value)}
                placeholder="ollama"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            Ollama 已运行，开启上方开关即可使用本地模型。
          </p>
        )}
      </div>
    </div>
  );
}
