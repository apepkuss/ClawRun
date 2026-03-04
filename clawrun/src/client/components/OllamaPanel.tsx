import React, { useState, useEffect, useRef } from 'react';

interface Model {
  name: string;
  size: number;
}

interface OllamaTagsResponse {
  models: Model[];
}

interface ModelTag {
  tag: string;
  size: string;
}

interface Props {
  healthy: boolean;
}

export function OllamaPanel({ healthy }: Props) {
  const [models, setModels] = useState<Model[]>([]);
  const [library, setLibrary] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [tags, setTags] = useState<ModelTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState('');
  const [pullPercent, setPullPercent] = useState(-1);   // -1 = no bar
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  // Fetch installed models
  useEffect(() => {
    if (!healthy) return;
    fetch('/api/ollama/models')
      .then((r) => r.json())
      .then((d) => setModels((d as OllamaTagsResponse).models ?? []))
      .catch(() => undefined);
  }, [healthy, refreshKey]);

  // Fetch library catalog
  useEffect(() => {
    if (!healthy) return;
    fetch('/api/ollama/library')
      .then((r) => r.json())
      .then((d) => setLibrary((d as { models: string[] }).models ?? []))
      .catch(() => undefined);
  }, [healthy]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch tags when a model is selected
  useEffect(() => {
    if (!selectedModel) { setTags([]); return; }
    setTagsLoading(true);
    setTags([]);
    fetch(`/api/ollama/library/${encodeURIComponent(selectedModel)}/tags`)
      .then((r) => r.json())
      .then((d) => setTags((d as { tags: ModelTag[] }).tags ?? []))
      .catch(() => setTags([]))
      .finally(() => setTagsLoading(false));
  }, [selectedModel]);

  const filtered = library
    .filter((name) => !searchText || name.toLowerCase().includes(searchText.toLowerCase()));

  // Filter out tags already installed for the selected model
  const installedTagsForModel = new Set(
    models
      .filter((m) => m.name.startsWith(selectedModel + ':'))
      .map((m) => m.name.split(':')[1]),
  );
  const availableTags = tags.filter((t) => !installedTagsForModel.has(t.tag));

  function selectModel(name: string) {
    setSelectedModel(name);
    setSearchText(name);
    setSelectedTag('');
    setModelDropdownOpen(false);
    setTagDropdownOpen(false);
  }

  async function handleDelete(name: string) {
    if (!confirm(`确认删除模型 ${name}？`)) return;
    setMessage('');
    try {
      const res = await fetch('/api/ollama/models', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      setMessage(`${name} 已删除`); setMessageOk(true);
      setRefreshKey((k) => k + 1);
    } catch {
      setMessage(`删除 ${name} 失败`); setMessageOk(false);
    }
  }

  async function handlePull(fullName: string) {
    if (!fullName.trim()) return;
    const name = fullName.trim();
    setPulling(true);
    setMessage('');
    setPullStatus('准备中…');
    setPullPercent(-1);
    try {
      const res = await fetch('/api/ollama/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '服务端错误');
      }
      // Poll for progress
      const poll = (): Promise<void> =>
        new Promise((resolve, reject) => {
          const iv = setInterval(async () => {
            try {
              const r = await fetch(`/api/ollama/models/pull/status?name=${encodeURIComponent(name)}`);
              const d = await r.json() as {
                active: boolean; status?: string; percent?: number;
                done?: boolean; success?: boolean; error?: string;
              };
              if (!d.active) { clearInterval(iv); reject(new Error('任务不存在')); return; }
              if (d.status) setPullStatus(d.status);
              if (d.percent != null && d.percent >= 0) setPullPercent(d.percent);
              if (d.done) {
                clearInterval(iv);
                if (d.success) resolve();
                else reject(new Error(d.error || '拉取未完成'));
              }
            } catch {
              clearInterval(iv);
              reject(new Error('轮询失败'));
            }
          }, 1000);
        });
      await poll();
      setMessage(`${name} 拉取完成`); setMessageOk(true);
      setRefreshKey((k) => k + 1);
      setSelectedModel(''); setSearchText(''); setTags([]);
    } catch (e) {
      setMessage(`拉取失败：${e instanceof Error ? e.message : '请检查模型名称'}`); setMessageOk(false);
    } finally {
      setPulling(false);
      setPullStatus('');
      setPullPercent(-1);
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
            <li key={m.name} className="flex items-center justify-between text-gray-600">
              <span>{m.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-gray-400">{(m.size / 1e9).toFixed(1)} GB</span>
                <button
                  onClick={() => void handleDelete(m.name)}
                  className="text-red-400 hover:text-red-600 text-xs"
                  title="删除模型"
                >
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Step 1: Model name selection */}
      <div className="mt-2" ref={modelRef}>
        <label className="text-xs text-gray-500 mb-1 block">选择模型</label>
        <div className="relative">
          <input
            type="text"
            placeholder="搜索或输入模型名称，如 qwen2.5"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setModelDropdownOpen(true);
              if (e.target.value !== selectedModel) {
                setSelectedModel('');
                setTags([]);
              }
            }}
            onFocus={() => setModelDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setModelDropdownOpen(false);
              if (e.key === 'Enter' && !selectedModel && searchText.trim()) {
                // Allow direct pull with typed name (e.g. custom model)
                setModelDropdownOpen(false);
                void handlePull(searchText.trim());
              }
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {modelDropdownOpen && filtered.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border rounded-lg shadow-lg">
              {filtered.map((name) => (
                <li
                  key={name}
                  onMouseDown={(e) => { e.preventDefault(); selectModel(name); }}
                  className="px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Step 2: Tag selection (always visible) */}
      <div ref={tagRef}>
        <label className="text-xs text-gray-500 mb-1 block">选择版本（Tag）</label>
        {!selectedModel ? (
          <button
            disabled
            className="w-full border rounded-lg px-3 py-2 text-sm text-left text-gray-300 bg-gray-50 cursor-not-allowed flex justify-between items-center"
          >
            <span>请先选择模型</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : tagsLoading ? (
          <p className="text-xs text-gray-400">加载 tag 列表…</p>
        ) : availableTags.length === 0 ? (
          <div className="flex gap-2 items-center">
            <p className="text-xs text-gray-400 flex-1">未找到 tag 列表，将拉取默认版本（latest）</p>
            <button
              onClick={() => void handlePull(selectedModel)}
              disabled={pulling}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {pulling ? '下载中…' : '下载 latest'}
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <button
                onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                disabled={pulling}
                className="w-full border rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-300 flex justify-between items-center"
              >
                <span className={selectedTag ? 'text-gray-700' : 'text-gray-400'}>
                  {selectedTag
                    ? `${selectedTag}${availableTags.find((t) => t.tag === selectedTag)?.size ? '  (' + availableTags.find((t) => t.tag === selectedTag)!.size + ')' : ''}`
                    : '点击选择 tag'}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {tagDropdownOpen && (
                <ul className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border rounded-lg shadow-lg">
                  {availableTags.map((t) => (
                    <li
                      key={t.tag}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedTag(t.tag);
                        setTagDropdownOpen(false);
                      }}
                      className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between ${t.tag === selectedTag ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50'}`}
                    >
                      <span>{t.tag}</span>
                      {t.size && <span className="text-gray-400 ml-2">{t.size}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Step 3: Download button (shown after tag is selected) */}
            {selectedTag && (
              <button
                onClick={() => void handlePull(`${selectedModel}:${selectedTag}`)}
                disabled={pulling}
                className="mt-2 w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {pulling ? '下载中…' : `下载 ${selectedModel}:${selectedTag}`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Download progress */}
      {pulling && (
        <div className="mt-1">
          <p className="text-xs text-gray-500 mb-1">{pullStatus || '准备中…'}</p>
          {pullPercent >= 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${pullPercent}%` }}
              />
            </div>
          )}
          {pullPercent >= 0 && (
            <p className="text-xs text-gray-400 mt-0.5 text-right">{pullPercent}%</p>
          )}
        </div>
      )}

      {message && <p className={`text-xs mt-1 ${messageOk ? 'text-green-600' : 'text-red-500'}`}>{message}</p>}
    </div>
  );
}
