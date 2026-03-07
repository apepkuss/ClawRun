import React from 'react';
import { PROVIDERS, POPULAR_MODELS } from './constants';
import type { WizardState } from './types';

interface Props {
  state: WizardState;
  onChange: (s: WizardState) => void;
  ollamaHealthy: boolean;
}

export function StepDefaultModel({ state, onChange, ollamaHealthy }: Props) {
  const ollamaConfigured = state.useOllama && ollamaHealthy && state.ollama.baseUrl.trim();

  // Collect models from configured cloud providers
  const configuredProviders = PROVIDERS.filter((p) => state.providers[p.id]?.trim());
  const availableModels = configuredProviders.flatMap(
    (p) => POPULAR_MODELS[p.id] ?? [],
  );

  function setModel(value: string) {
    onChange({ ...state, defaultModel: value });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">选择 OpenClaw 默认使用的 AI 模型。</p>

      {ollamaConfigured ? (
        /* Ollama mode: simple model name input only */
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              已启用 Ollama，请输入已下载的模型标识。
            </p>
            <p className="text-xs text-blue-500 mt-1">
              请确保已在 Ollama 应用中下载对应模型，例如 ollama/qwen3:0.6b
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">模型标识</label>
            <input
              type="text"
              value={state.defaultModel}
              onChange={(e) => setModel(e.target.value)}
              placeholder="ollama/model-name"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
            />
          </div>
        </div>
      ) : availableModels.length === 0 ? (
        <div className="bg-gray-50 border rounded-lg p-4">
          <p className="text-sm text-gray-500">
            暂无已配置的模型服务商。请返回上一步配置 API Key，或跳过此步骤。
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {availableModels.map((m) => (
              <label
                key={m.value}
                className={`flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                  state.defaultModel === m.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="defaultModel"
                  value={m.value}
                  checked={state.defaultModel === m.value}
                  onChange={() => setModel(m.value)}
                  className="text-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">{m.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{m.value}</span>
                </div>
              </label>
            ))}
          </div>

          {/* Custom model input */}
          <div className="border-t pt-3 mt-3">
            <label className="block text-xs text-gray-500 mb-1">或输入自定义模型标识</label>
            <input
              type="text"
              value={state.defaultModel}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider/model-name"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
            />
          </div>
        </>
      )}
    </div>
  );
}
