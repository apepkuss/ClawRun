import React, { useState, useEffect } from 'react';
import { useAppStatus } from './hooks/useAppStatus';
import { AppCard } from './components/AppCard';
import { ConnectPanel } from './components/ConnectPanel';
import { OllamaPanel } from './components/OllamaPanel';
import { SetupWizard } from './components/SetupWizard';

type Tab = 'dashboard' | 'settings';
type SettingsTab = 'openclaw' | 'ollama';

export default function App() {
  const { status, loading, refresh, setFastPoll } = useAppStatus();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('openclaw');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardChecked, setWizardChecked] = useState(false);
  const [busyApps, setBusyApps] = useState<Record<string, string>>({});

  // Clear brief busy state once CRD installState takes over
  useEffect(() => {
    if (!status || Object.keys(busyApps).length === 0) return;
    const installStateMap: Record<string, string | null> = {
      openclaw: status.openclaw.installState,
      'ollama-cpu': status.ollama.installState,
      ollama: status.ollama.installState,
    };
    for (const appName of Object.keys(busyApps)) {
      const crdState = installStateMap[appName];
      // CRD state appeared → clear the brief busy indicator
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
      inProgressStates.includes(status.ollama.installState ?? '') ||
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

  async function connectOllama(values: Record<string, string>) {
    await fetch('/api/ollama/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: values.endpoint, uiUrl: values.uiUrl }),
    });
    refresh();
  }

  function isAppServiceError(data: Record<string, unknown>): boolean {
    // Olares app-service uses code:200 for success, code:0 is also OK
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
    // API call succeeded — brief busy until CRD state takes over
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
        setBusy(name, null);
        return;
      }
      const data = await res.json();
      if (isAppServiceError(data)) {
        alert(`卸载 ${name} 失败: ${data.message || JSON.stringify(data)}`);
        setBusy(name, null);
        return;
      }
    } catch (err) {
      alert(`卸载 ${name} 请求异常: ${String(err)}`);
      setBusy(name, null);
      return;
    }
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
              <div className="grid grid-cols-2 gap-4">
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
                    // Pass gateway token via URL param so Control UI auto-configures
                    if (url && status?.openclaw.token) {
                      const sep = url.includes('?') ? '&' : '?';
                      url = `${url}${sep}token=${encodeURIComponent(status.openclaw.token)}`;
                    }
                    window.open(url, '_blank');
                  }}
                  onUninstall={() => { void uninstall('openclaw'); }}
                />
                <AppCard
                  name={`Ollama${status?.ollama.variant === 'cpu' ? ' (CPU)' : status?.ollama.variant === 'gpu' ? ' (GPU)' : ''}`}
                  healthy={status?.ollama.healthy ?? false}
                  endpoint={status?.ollama.endpoint ?? null}
                  installState={status?.ollama.installState ?? null}
                  installProgress={status?.ollama.installProgress ?? null}
                  busy={busyApps['ollama-cpu'] || busyApps['ollama']}
                  installOptions={status?.ollama.variant ? [] : [
                    { label: '安装 CPU', onClick: () => { void installApp('ollama-cpu'); } },
                    { label: '安装 GPU', onClick: () => { window.open('https://market.olares.com/app/ollama', '_blank'); } },
                  ]}
                  onUninstall={() => { void uninstall(status?.ollama.variant === 'cpu' ? 'ollama-cpu' : 'ollama'); }}
                />
              </div>
            )}

          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-6">
            {/* Sub-tabs */}
            <div className="flex gap-1 border-b pb-2">
              {([['openclaw', 'OpenClaw'], ['ollama', 'Ollama']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSettingsTab(key)}
                  className={`px-4 py-1.5 rounded-t-lg text-sm font-medium transition-colors ${
                    settingsTab === key
                      ? 'bg-white border border-b-white -mb-[9px] text-blue-600'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {settingsTab === 'openclaw' && (
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
            )}

            {settingsTab === 'ollama' && (
              <>
                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <ConnectPanel
                    key={`ollama-${status?.ollama.endpoint ?? ''}`}
                    label="Ollama 连接"
                    fields={[
                      { key: 'endpoint', label: '服务端点（内网）', placeholder: 'http://ollama-cpu-svc.ollama-cpu-apepkuss:11434' },
                      { key: 'uiUrl', label: 'Web UI 地址（外网）', placeholder: 'https://xxxx.apepkuss.olares.cn' },
                    ]}
                    initialValues={{
                      endpoint: status?.ollama.endpoint ?? '',
                      uiUrl: status?.ollama.uiUrl ?? '',
                    }}
                    onConnect={connectOllama}
                  />
                </div>
                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <OllamaPanel healthy={status?.ollama.healthy ?? false} />
                </div>
              </>
            )}
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
