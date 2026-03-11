import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../locales';

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

interface ModelParamsData {
  params: Record<string, string>;
}

const PARAM_KEYS = ['num_ctx', 'num_gpu', 'temperature', 'top_p', 'top_k', 'repeat_penalty'] as const;

interface Props {
  healthy: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1e6) return (bytes / 1e3).toFixed(0) + ' KB';
  if (bytes < 1e9) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e9).toFixed(2) + ' GB';
}

export function OllamaPanel({ healthy }: Props) {
  const { t } = useLocale();
  const [models, setModels] = useState<Model[]>([]);
  const [library, setLibrary] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [tags, setTags] = useState<ModelTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState('');
  const [pullPercent, setPullPercent] = useState(-1);
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [editParams, setEditParams] = useState<Record<string, string>>({});
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
  const availableTags = tags.filter((tg) => !installedTagsForModel.has(tg.tag));

  function selectModel(name: string) {
    setSelectedModel(name);
    setSearchText(name);
    setSelectedTag('');
    setModelDropdownOpen(false);
    setTagDropdownOpen(false);
  }

  async function toggleParams(name: string) {
    if (expandedModel === name) {
      setExpandedModel(null);
      return;
    }
    setExpandedModel(name);
    setParamsLoading(true);
    setEditParams({});
    try {
      const res = await fetch(`/api/ollama/models/${encodeURIComponent(name)}/params`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ModelParamsData;
      setEditParams(data.params ?? {});
    } catch {
      setMessage(t('params.loadFailed')); setMessageOk(false);
      setExpandedModel(null);
    } finally {
      setParamsLoading(false);
    }
  }

  async function handleSaveParams(name: string) {
    setParamsSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/ollama/models/${encodeURIComponent(name)}/params`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: editParams }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'unknown error');
      }
      setMessage(t('params.saved', { name })); setMessageOk(true);
      setExpandedModel(null);
    } catch (e) {
      setMessage(t('params.saveFailed', { error: e instanceof Error ? e.message : 'unknown' })); setMessageOk(false);
    } finally {
      setParamsSaving(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(t('models.confirmDelete', { name }))) return;
    setMessage('');
    try {
      const res = await fetch('/api/ollama/models', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      setMessage(t('models.deleted', { name })); setMessageOk(true);
      setRefreshKey((k) => k + 1);
    } catch {
      setMessage(t('models.deleteFailed', { name })); setMessageOk(false);
    }
  }

  async function handlePull(fullName: string) {
    if (!fullName.trim()) return;
    const name = fullName.trim();
    setPulling(true);
    setMessage('');
    setPullStatus(t('pull.preparing'));
    setPullPercent(-1);
    try {
      const res = await fetch('/api/ollama/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || t('pull.serverError'));
      }
      // Poll for progress
      const poll = (): Promise<void> =>
        new Promise((resolve, reject) => {
          const iv = setInterval(async () => {
            try {
              const r = await fetch(`/api/ollama/models/pull/status?name=${encodeURIComponent(name)}`);
              const d = await r.json() as {
                active: boolean; status?: string; percent?: number;
                completed?: number; total?: number;
                done?: boolean; success?: boolean; error?: string;
              };
              if (!d.active) { clearInterval(iv); reject(new Error(t('pull.taskNotFound'))); return; }
              if (d.completed && d.total) {
                setPullStatus(`${formatBytes(d.completed)} / ${formatBytes(d.total)}`);
              } else if (d.status) {
                setPullStatus(d.status);
              }
              if (d.percent != null && d.percent >= 0) setPullPercent(d.percent);
              if (d.done) {
                clearInterval(iv);
                if (d.success) resolve();
                else reject(new Error(d.error || t('pull.incomplete')));
              }
            } catch {
              clearInterval(iv);
              reject(new Error(t('pull.pollFailed')));
            }
          }, 1000);
        });
      await poll();
      setMessage(t('pull.completed', { name })); setMessageOk(true);
      setRefreshKey((k) => k + 1);
      setSelectedModel(''); setSearchText(''); setTags([]);
    } catch (e) {
      setMessage(t('pull.failed', { error: e instanceof Error ? e.message : t('pull.checkName') })); setMessageOk(false);
    } finally {
      setPulling(false);
      setPullStatus('');
      setPullPercent(-1);
    }
  }

  if (!healthy) {
    return <p className="text-sm text-gray-400">{t('offline.waiting')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-gray-700">{t('models.installed')}</h3>
      {models.length === 0 ? (
        <p className="text-sm text-gray-400">{t('models.empty')}</p>
      ) : (
        <ul className="text-sm space-y-1">
          {models.map((m) => (
            <li key={m.name}>
              <div className="flex items-center justify-between text-gray-600">
                <span>{m.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-400">{(m.size / 1e9).toFixed(1)} GB</span>
                  <button
                    onClick={() => void toggleParams(m.name)}
                    className={`text-xs ${expandedModel === m.name ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                    title={t('params.settings')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void handleDelete(m.name)}
                    className="text-red-400 hover:text-red-600 text-xs"
                    title={t('models.deleteTitle')}
                  >
                    {t('models.delete')}
                  </button>
                </span>
              </div>
              {expandedModel === m.name && (
                <div className="mt-2 mb-2 ml-2 p-3 bg-gray-50 rounded-lg border text-xs">
                  {paramsLoading ? (
                    <p className="text-gray-400">{t('params.loading')}</p>
                  ) : (
                    <>
                      <p className="font-medium text-gray-600 mb-2">{t('params.title')}</p>
                      <div className="space-y-2">
                        {PARAM_KEYS.map((key) => (
                          <div key={key}>
                            <label className="flex items-center gap-1 text-gray-600 mb-0.5">
                              <span>{t(`params.${key}`)}</span>
                            </label>
                            <input
                              type="text"
                              placeholder={t('params.notSet')}
                              value={editParams[key] ?? ''}
                              onChange={(e) => setEditParams((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                            />
                            <p className="text-gray-400 mt-0.5">{t(`params.${key}.hint`)}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => void handleSaveParams(m.name)}
                        disabled={paramsSaving}
                        className="mt-3 px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        {paramsSaving ? t('params.saving') : t('params.save')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Step 1: Model name selection */}
      <div className="mt-2" ref={modelRef}>
        <label className="text-xs text-gray-500 mb-1 block">{t('pull.selectModel')}</label>
        <div className="relative">
          <input
            type="text"
            placeholder={t('pull.searchPlaceholder')}
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

      {/* Step 2: Tag selection */}
      <div ref={tagRef}>
        <label className="text-xs text-gray-500 mb-1 block">{t('pull.selectTag')}</label>
        {!selectedModel ? (
          <button
            disabled
            className="w-full border rounded-lg px-3 py-2 text-sm text-left text-gray-300 bg-gray-50 cursor-not-allowed flex justify-between items-center"
          >
            <span>{t('pull.selectModelFirst')}</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : tagsLoading ? (
          <p className="text-xs text-gray-400">{t('pull.loadingTags')}</p>
        ) : availableTags.length === 0 ? (
          <div className="flex gap-2 items-center">
            <p className="text-xs text-gray-400 flex-1">{t('pull.noTags')}</p>
            <button
              onClick={() => void handlePull(selectedModel)}
              disabled={pulling}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {pulling ? t('pull.downloading') : t('pull.downloadLatest')}
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
                    ? `${selectedTag}${availableTags.find((tg) => tg.tag === selectedTag)?.size ? '  (' + availableTags.find((tg) => tg.tag === selectedTag)!.size + ')' : ''}`
                    : t('pull.selectTag.placeholder')}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {tagDropdownOpen && (
                <ul className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border rounded-lg shadow-lg">
                  {availableTags.map((tg) => (
                    <li
                      key={tg.tag}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedTag(tg.tag);
                        setTagDropdownOpen(false);
                      }}
                      className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between ${tg.tag === selectedTag ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50'}`}
                    >
                      <span>{tg.tag}</span>
                      {tg.size && <span className="text-gray-400 ml-2">{tg.size}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedTag && (
              <button
                onClick={() => void handlePull(`${selectedModel}:${selectedTag}`)}
                disabled={pulling}
                className="mt-2 w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {pulling ? t('pull.downloading') : t('pull.download', { name: `${selectedModel}:${selectedTag}` })}
              </button>
            )}
          </>
        )}
      </div>

      {/* Download progress */}
      {pulling && (
        <div className="mt-1">
          <p className="text-xs text-gray-500 mb-1">{pullStatus || t('pull.preparing')}</p>
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
