import React, { useState } from 'react';
import { useAppStatus } from './hooks/useAppStatus';
import { AppCard } from './components/AppCard';
import { ConnectPanel } from './components/ConnectPanel';
import { OllamaPanel } from './components/OllamaPanel';

type Tab = 'dashboard' | 'settings';

// Helm chart 仓库地址（GitHub raw），提供 static-index.yaml 索引
const CHART_REPO_URL = 'https://raw.githubusercontent.com/apepkuss/ClawRun/main/charts';

export default function App() {
  const { status, loading, refresh } = useAppStatus();
  const [tab, setTab] = useState<Tab>('dashboard');

  async function connectOpenClaw(values: Record<string, string>) {
    await fetch('/api/openclaw/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: values.endpoint, token: values.token, uiUrl: values.uiUrl }),
    });
    refresh();
  }

  async function connectOllama(values: Record<string, string>) {
    await fetch('/api/ollama/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: values.endpoint }),
    });
    refresh();
  }

  async function installApp(appName: string) {
    if (!confirm(`确认安装 ${appName}？`)) return;
    const res = await fetch(`/api/apps/${appName}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: CHART_REPO_URL }),
    });
    if (!res.ok) {
      alert(`${appName} 安装请求失败，请查看控制台`);
      return;
    }
    refresh();
  }

  async function uninstall(name: string) {
    if (!confirm(`确认卸载 ${name}？`)) return;
    await fetch(`/api/apps/${name}/uninstall`, { method: 'POST' });
    refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">ClawRun</h1>
        <div className="flex gap-1">
          {(['dashboard', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t === 'dashboard' ? '应用状态' : '配置'}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {tab === 'dashboard' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
              应用状态
            </h2>
            {loading ? (
              <p className="text-gray-400 text-sm">加载中…</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <AppCard
                  name="OpenClaw"
                  healthy={status?.openclaw.healthy ?? false}
                  endpoint={status?.openclaw.endpoint ?? null}
                  installOptions={[
                    { label: '安装', onClick: () => { void installApp('openclaw'); } },
                  ]}
                  onOpen={() => window.open(status?.openclaw.uiUrl ?? status?.openclaw.endpoint ?? '', '_blank')}
                  onUninstall={() => { void uninstall('openclaw'); }}
                />
                <AppCard
                  name="Ollama"
                  healthy={status?.ollama.healthy ?? false}
                  endpoint={status?.ollama.endpoint ?? null}
                  installOptions={[
                    { label: '安装 CPU', onClick: () => { void installApp('ollama-cpu'); } },
                    { label: '安装 GPU', onClick: () => { window.open('https://market.olares.com/app/ollama', '_blank'); } },
                  ]}
                  onUninstall={() => { void uninstall('ollama'); }}
                />
              </div>
            )}

            {/* Ollama 模型管理 */}
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <OllamaPanel healthy={status?.ollama.healthy ?? false} />
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
              连接配置
            </h2>
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <ConnectPanel
                key={`openclaw-${status?.openclaw.endpoint ?? ''}`}
                label="OpenClaw 连接"
                fields={[
                  { key: 'endpoint', label: '健康检查端点（内网）', placeholder: 'http://openclaw-svc.openclaw-apepkuss:18789' },
                  { key: 'token', label: 'Gateway Token', placeholder: 'OPENCLAW_GATEWAY_TOKEN 的值', type: 'password' },
                  { key: 'uiUrl', label: 'Web UI 地址（外网）', placeholder: 'https://openclaw.xxxx.apepkuss.olares.cn' },
                ]}
                initialValues={{
                  endpoint: status?.openclaw.endpoint ?? '',
                  uiUrl: status?.openclaw.uiUrl ?? '',
                }}
                onConnect={connectOpenClaw}
              />
            </div>
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <ConnectPanel
                label="Ollama 连接"
                fields={[
                  { key: 'endpoint', label: '外部端点 URL', placeholder: 'https://xxxx.apepkuss.olares.cn' },
                ]}
                onConnect={connectOllama}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
