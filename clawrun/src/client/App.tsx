import React, { useState, useEffect } from 'react';
import { useAppStatus } from './hooks/useAppStatus';
import { AppCard } from './components/AppCard';
import { ConnectPanel } from './components/ConnectPanel';
import { SetupWizard } from './components/SetupWizard';

type Tab = 'dashboard' | 'settings';

export default function App() {
  const { status, loading, refresh, setFastPoll } = useAppStatus();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardChecked, setWizardChecked] = useState(false);
  const [busyApps, setBusyApps] = useState<Record<string, string>>({});

  // Clear brief busy state once CRD installState takes over
  useEffect(() => {
    if (!status || Object.keys(busyApps).length === 0) return;
    const installStateMap: Record<string, string | null> = {
      openclaw: status.openclaw.installState,
    };
    for (const appName of Object.keys(busyApps)) {
      const crdState = installStateMap[appName];
      if (crdState) {
        setBusy(appName, null);
      }
    }
  }, [status, busyApps]);

  // Enable fast polling when any app has an in-progress CRD state
  useEffect(() => {
    if (!status) return;
    const inProgressStates = ['pending', 'downloading', 'installing', 'uninstalling', 'resuming', 'suspending', 'upgrading'];
    const anyInProgress =
      inProgressStates.includes(status.openclaw.installState ?? '') ||
      Object.keys(busyApps).length > 0;
    setFastPoll(anyInProgress);
  }, [status, busyApps]);

  // Auto-detect first-time setup: show wizard when OpenClaw is healthy but wizard not completed
  useEffect(() => {
    if (!status?.openclaw.healthy || wizardChecked) return;
    fetch('/api/openclaw/wizard-status')
      .then((r) => r.json())
      .then((d: { completed: boolean }) => {
        if (!d.completed) setShowWizard(true);
        setWizardChecked(true);
      })
      .catch(() => setWizardChecked(true));
  }, [status?.openclaw.healthy, wizardChecked]);

  async function connectOpenClaw(values: Record<string, string>) {
    await fetch('/api/openclaw/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: values.endpoint, token: values.token, uiUrl: values.uiUrl }),
    });
    refresh();
  }

  function isAppServiceError(data: Record<string, unknown>): boolean {
    if (data?.code === undefined) return false;
    const code = Number(data.code);
    return code !== 0 && code !== 200;
  }

  function setBusy(appName: string, label: string | null) {
    setBusyApps((prev) => {
      if (!label) {
        const next = { ...prev };
        delete next[appName];
        return next;
      }
      return { ...prev, [appName]: label };
    });
  }

  async function installApp(appName: string) {
    if (!confirm(`确认安装 ${appName}？`)) return;
    setBusy(appName, '安装中…');
    try {
      const res = await fetch(`/api/apps/${appName}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`安装 ${appName} 失败 (${res.status}): ${text}`);
        setBusy(appName, null);
        return;
      }
      const data = await res.json();
      if (isAppServiceError(data)) {
        alert(`安装 ${appName} 失败: ${data.message || JSON.stringify(data)}`);
        setBusy(appName, null);
        return;
      }
    } catch (err) {
      alert(`安装 ${appName} 请求异常: ${String(err)}`);
      setBusy(appName, null);
      return;
    }
    setBusy(appName, '部署中…');
    setFastPoll(true);
    refresh();
  }

  async function uninstall(name: string) {
    if (!confirm(`确认卸载 ${name}？`)) return;
    setBusy(name, '卸载中…');
    try {
      const res = await fetch(`/api/apps/${name}/uninstall`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        alert(`卸载 ${name} 失败 (${res.status}): ${text}`);
      } else {
        const data = await res.json();
        if (isAppServiceError(data)) {
          alert(`卸载 ${name} 失败: ${data.message || JSON.stringify(data)}`);
        }
      }
    } catch (err) {
      alert(`卸载 ${name} 请求异常: ${String(err)}`);
    }
    setBusy(name, null);
    setFastPoll(true);
    refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">ClawRun</h1>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('dashboard')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            应用状态
          </button>
          {status?.openclaw.healthy && (
            <button
              onClick={() => setShowWizard(true)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors"
            >
              配置向导
            </button>
          )}
          <button
            onClick={() => setTab('settings')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            配置
          </button>
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
              <div className="grid grid-cols-1 gap-4">
                <AppCard
                  name="OpenClaw"
                  healthy={status?.openclaw.healthy ?? false}
                  endpoint={status?.openclaw.endpoint ?? null}
                  installState={status?.openclaw.installState ?? null}
                  installProgress={status?.openclaw.installProgress ?? null}
                  busy={busyApps['openclaw']}
                  installOptions={[
                    { label: '安装', onClick: () => { void installApp('openclaw'); } },
                  ]}
                  onOpen={() => {
                    let url = status?.openclaw.uiUrl ?? status?.openclaw.endpoint ?? '';
                    if (url && status?.openclaw.token) {
                      const sep = url.includes('?') ? '&' : '?';
                      url = `${url}${sep}token=${encodeURIComponent(status.openclaw.token)}`;
                    }
                    window.open(url, '_blank');
                  }}
                  onUninstall={() => { void uninstall('openclaw'); }}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
              OpenClaw 配置
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
          </div>
        )}
      </main>

      <SetupWizard
        open={showWizard}
        onClose={() => {
          setShowWizard(false);
          refresh();
        }}
        ollamaHealthy={status?.ollama.healthy ?? false}
        ollamaEndpoint={status?.ollama.endpoint ?? null}
      />
    </div>
  );
}
