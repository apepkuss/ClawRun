import React, { useState, useEffect } from 'react';

interface Model {
  name: string;
  size: number;
}

interface OllamaTagsResponse {
  models: Model[];
}

interface Props {
  healthy: boolean;
}

export function OllamaPanel({ healthy }: Props) {
  const [models, setModels] = useState<Model[]>([]);
  const [pullName, setPullName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!healthy) return;
    fetch('/api/ollama/models')
      .then((r) => r.json())
      .then((d) => setModels((d as OllamaTagsResponse).models ?? []))
      .catch(() => undefined);
  }, [healthy]);

  async function handlePull() {
    if (!pullName.trim()) return;
    setPulling(true);
    setMessage('');
    try {
      await fetch('/api/ollama/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pullName.trim() }),
      });
      setMessage(`✓ ${pullName} 拉取完成`);
      setPullName('');
    } catch {
      setMessage('拉取失败，请检查模型名称');
    } finally {
      setPulling(false);
    }
  }

  if (!healthy) {
    return <p className="text-sm text-gray-400">Ollama 离线，请先配置端点</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-gray-700">已安装模型</h3>
      {models.length === 0 ? (
        <p className="text-sm text-gray-400">暂无模型</p>
      ) : (
        <ul className="text-sm space-y-1">
          {models.map((m) => (
            <li key={m.name} className="flex justify-between text-gray-600">
              <span>{m.name}</span>
              <span className="text-gray-400">{(m.size / 1e9).toFixed(1)} GB</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          placeholder="qwen2.5 / llama3.2 …"
          value={pullName}
          onChange={(e) => setPullName(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          onClick={() => { void handlePull(); }}
          disabled={pulling}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pulling ? '拉取中…' : '拉取'}
        </button>
      </div>
      {message && <p className="text-xs text-green-600">{message}</p>}
    </div>
  );
}
