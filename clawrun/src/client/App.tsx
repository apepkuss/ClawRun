import React, { useState, useEffect } from 'react';
import { useAppStatus } from './hooks/useAppStatus';
import { useLocale } from './locales';
import { AppCard } from './components/AppCard';
import { ConnectPanel } from './components/ConnectPanel';
import { OpenClawManager } from './components/OpenClawManager';
import { LiteLLMManager } from './components/LiteLLMManager';

type View = 'dashboard' | 'settings' | 'openclaw-manager' | 'litellm-manager';

export default function App() {
  const { status, loading, refresh, setFastPoll } = useAppStatus();
  const { locale, setLocale, t } = useLocale();
  const [view, setView] = useState<View>('dashboard');
  const [busyApps, setBusyApps] = useState<Record<string, string>>({});

  // Clear brief busy state once CRD installState takes over
  useEffect(() => {
    if (!status || Object.keys(busyApps).length === 0) return;
    const installStateMap: Record<string, string | null> = {
      openclaw: status.openclaw.installState,
      litellm: status.litellm.installState,
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
      inProgressStates.includes(status.litellm.installState ?? '') ||
      Object.keys(busyApps).length > 0;
    setFastPoll(anyInProgress);
  }, [status, busyApps]);

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
    if (!confirm(t('app.confirmInstall', { name: appName }))) return;
    setBusy(appName, t('status.installing'));
    try {
      const res = await fetch(`/api/apps/${appName}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(t('app.installFailed', { name: appName, status: String(res.status), detail: text }));
        setBusy(appName, null);
        return;
      }
      const data = await res.json();
      if (isAppServiceError(data)) {
        alert(t('app.installFailed', { name: appName, status: '', detail: String(data.message || JSON.stringify(data)) }));
        setBusy(appName, null);
        return;
      }
    } catch (err) {
      alert(t('app.installError', { name: appName, detail: String(err) }));
      setBusy(appName, null);
      return;
    }
    setBusy(appName, t('status.deploying'));
    setFastPoll(true);
    refresh();
  }

  async function uninstall(name: string) {
    if (!confirm(t('app.confirmUninstall', { name }))) return;
    setBusy(name, t('status.uninstalling'));
    try {
      const res = await fetch(`/api/apps/${name}/uninstall`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        alert(t('app.uninstallFailed', { name, status: String(res.status), detail: text }));
      } else {
        const data = await res.json();
        if (isAppServiceError(data)) {
          alert(t('app.uninstallFailed', { name, status: '', detail: String(data.message || JSON.stringify(data)) }));
        }
      }
    } catch (err) {
      alert(t('app.uninstallError', { name, detail: String(err) }));
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
        <div className="flex items-center gap-3">
          {view !== 'openclaw-manager' && view !== 'litellm-manager' && (
            <div className="flex gap-1">
              <button
                onClick={() => setView('dashboard')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t('app.tabs.status')}
              </button>
              <button
                onClick={() => setView('settings')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t('app.tabs.config')}
              </button>
            </div>
          )}
          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded border border-gray-200"
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {view === 'dashboard' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
              {t('app.tabs.status')}
            </h2>
            {loading ? (
              <p className="text-gray-400 text-sm">{t('common.loading')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AppCard
                  name="OpenClaw"
                  healthy={status?.openclaw.healthy ?? false}
                  endpoint={status?.openclaw.endpoint ?? null}
                  installState={status?.openclaw.installState ?? null}
                  installProgress={status?.openclaw.installProgress ?? null}
                  replicas={status?.openclaw.replicas ?? null}
                  busy={busyApps['openclaw']}
                  installOptions={[
                    { label: t('common.install'), onClick: () => { void installApp('openclaw'); } },
                  ]}
                  onOpen={() => setView('openclaw-manager')}
                  onUninstall={() => { void uninstall('openclaw'); }}
                />
                <AppCard
                  name="LiteLLM"
                  healthy={status?.litellm.healthy ?? false}
                  endpoint={status?.litellm.endpoint ?? null}
                  installState={status?.litellm.installState ?? null}
                  installProgress={status?.litellm.installProgress ?? null}
                  replicas={status?.litellm.replicas ?? null}
                  busy={busyApps['litellm']}
                  installOptions={[
                    { label: t('common.install'), onClick: () => { void installApp('litellm'); } },
                  ]}
                  onOpen={() => setView('litellm-manager')}
                  onUninstall={() => { void uninstall('litellm'); }}
                />
              </div>
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
              {t('app.openclawConfig')}
            </h2>
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <ConnectPanel
                key={`openclaw-${status?.openclaw.endpoint ?? ''}`}
                label={t('app.openclawConnection')}
                fields={[
                  { key: 'endpoint', label: t('app.healthEndpoint'), placeholder: 'http://openclaw-svc.openclaw-apepkuss:18789' },
                  { key: 'token', label: t('app.gatewayToken'), placeholder: t('app.gatewayTokenPlaceholder'), type: 'password' },
                  { key: 'uiUrl', label: t('app.uiUrl'), placeholder: 'https://openclaw.xxxx.apepkuss.olares.cn' },
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

        {view === 'openclaw-manager' && status && (
          <OpenClawManager
            status={status}
            onBack={() => setView('dashboard')}
            refresh={refresh}
          />
        )}

        {view === 'litellm-manager' && status && (
          <LiteLLMManager
            status={status}
            onBack={() => setView('dashboard')}
            refresh={refresh}
          />
        )}
      </main>
    </div>
  );
}
