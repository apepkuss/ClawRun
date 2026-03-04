import React from 'react';
import type { WizardState } from './types';

interface Props {
  state: WizardState;
  onChange: (s: WizardState) => void;
  ollamaHealthy: boolean;
  ollamaEndpoint: string | null;
}

export function StepOllama({ state, onChange, ollamaHealthy, ollamaEndpoint }: Props) {
  function update(field: 'baseUrl' | 'apiKey', value: string) {
    onChange({
      ...state,
      ollama: { ...state.ollama, [field]: value },
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        将本地 Ollama 实例连接到 OpenClaw，使其可以使用 Ollama 提供的模型。
      </p>

      {/* Ollama status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${ollamaHealthy ? 'bg-green-500' : 'bg-gray-300'}`}
        />
        <span className="text-sm text-gray-600">
          Ollama 状态：{ollamaHealthy ? '运行中' : '离线'}
        </span>
      </div>

      {!ollamaHealthy ? (
        <div className="bg-gray-50 border rounded-lg p-4">
          <p className="text-sm text-gray-500">
            Ollama 当前未安装或未运行。你可以跳过此步骤，稍后在 Dashboard 中安装 Ollama 后再配置。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ollama Base URL</label>
            <input
              type="text"
              value={state.ollama.baseUrl}
              onChange={(e) => update('baseUrl', e.target.value)}
              placeholder={ollamaEndpoint ?? 'http://ollama-svc:11434'}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              OpenClaw 将通过此地址访问 Ollama。如果 Ollama 已在同一集群中运行，使用内网地址即可。
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key（可选）</label>
            <input
              type="text"
              value={state.ollama.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder="ollama"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
