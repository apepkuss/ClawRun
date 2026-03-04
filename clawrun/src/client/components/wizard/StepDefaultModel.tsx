import React from 'react';
import { PROVIDERS, POPULAR_MODELS } from './constants';
import type { WizardState } from './types';

interface Props {
  state: WizardState;
  onChange: (s: WizardState) => void;
}

export function StepDefaultModel({ state, onChange }: Props) {
  // Collect models from configured providers
  const configuredProviders = PROVIDERS.filter((p) => state.providers[p.id]?.trim());
  const availableModels = configuredProviders.flatMap(
    (p) => POPULAR_MODELS[p.id] ?? [],
  );

  // Also allow Ollama models if Ollama is configured
  if (state.ollama.baseUrl.trim()) {
    availableModels.push(
      { label: 'Ollama - Qwen 2.5', value: 'ollama/qwen2.5' },
      { label: 'Ollama - Llama 3', value: 'ollama/llama3' },
      { label: 'Ollama - Qwen 3', value: 'ollama/qwen3' },
    );
  }

  function setModel(value: string) {
    onChange({ ...state, defaultModel: value });
  }

  if (availableModels.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 border rounded-lg p-4">
          <p className="text-sm text-gray-500">
            暂无已配置的模型服务商。请返回上一步配置 API Key，或跳过此步骤。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">选择 OpenClaw 默认使用的 AI 模型。</p>
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
    </div>
  );
}
