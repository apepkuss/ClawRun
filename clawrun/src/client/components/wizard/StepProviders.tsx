import React, { useState } from 'react';
import { useLocale } from '../../locales';
import { PROVIDERS } from './constants';
import type { WizardState } from './types';

interface Props {
  state: WizardState;
  onChange: (s: WizardState) => void;
  configuredEnvVars: string[];
  ollamaHealthy: boolean;
  ollamaEndpoint: string | null;
  clawRouterInstalled: boolean;
}

export function StepProviders({ state, onChange, configuredEnvVars, ollamaHealthy, ollamaEndpoint, clawRouterInstalled }: Props) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);

  const cloudDisabled = state.useOllama || state.useClawRouter;

  function setKey(providerId: string, value: string) {
    onChange({
      ...state,
      providers: { ...state.providers, [providerId]: value },
    });
  }

  function toggleOllama(enabled: boolean) {
    onChange({
      ...state,
      useOllama: enabled,
      useClawRouter: enabled ? false : state.useClawRouter,
      defaultModel: enabled ? '' : state.defaultModel,
      ollama: {
        ...state.ollama,
        baseUrl: enabled && !state.ollama.baseUrl && ollamaEndpoint ? ollamaEndpoint : state.ollama.baseUrl,
      },
    });
  }

  function toggleClawRouter(enabled: boolean) {
    onChange({
      ...state,
      useClawRouter: enabled,
      useOllama: enabled ? false : state.useOllama,
      defaultModel: enabled ? '' : state.defaultModel,
    });
  }

  function updateOllama(field: 'baseUrl' | 'apiKey', value: string) {
    onChange({
      ...state,
      ollama: { ...state.ollama, [field]: value },
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Cloud Providers ── */}
      <div className={cloudDisabled ? 'opacity-50 pointer-events-none' : ''}>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('providers.cloudProviders')}</h3>
        <p className="text-xs text-gray-400 mb-3">
          {cloudDisabled
            ? t('providers.cloudDisabledHint')
            : t('providers.cloudHint')}
        </p>
        <div className="space-y-2">
          {PROVIDERS.map((p) => {
            const isOpen = expanded === p.id && !cloudDisabled;
            const hasNewKey = !!state.providers[p.id]?.trim();
            const isAlreadyConfigured = configuredEnvVars.includes(p.envVar);
            return (
              <div key={p.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => !cloudDisabled && setExpanded(isOpen ? null : p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700">{t('provider.' + p.id)}</span>
                  <div className="flex items-center gap-2">
                    {hasNewKey && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {t('providers.pendingSave')}
                      </span>
                    )}
                    {!hasNewKey && isAlreadyConfigured && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {t('providers.configured')}
                      </span>
                    )}
                    <span className="text-gray-400 text-xs">{isOpen ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 border-t bg-gray-50">
                    <label className="block text-xs text-gray-500 mt-2 mb-1">API Key</label>
                    <input
                      type="password"
                      value={state.providers[p.id] ?? ''}
                      onChange={(e) => setKey(p.id, e.target.value)}
                      placeholder={isAlreadyConfigured ? t('providers.configuredPlaceholder') : t('providers.enterApiKey', { name: t('provider.' + p.id) })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t" />

      {/* ── Local Ollama ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">{t('providers.localModel')}</h3>
          {ollamaHealthy && (
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={state.useOllama}
                onChange={(e) => toggleOllama(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              <span className="ml-2 text-xs text-gray-500">{state.useOllama ? t('providers.enabled') : t('providers.disabled')}</span>
            </label>
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2.5 h-2.5 rounded-full ${ollamaHealthy ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-sm text-gray-600">
            {t('providers.ollamaStatus', { status: ollamaHealthy ? t('status.running') : t('status.offline') })}
          </span>
        </div>

        {!ollamaHealthy ? (
          <p className="text-xs text-gray-400">
            {t('providers.ollamaNotRunning')}
          </p>
        ) : state.useOllama ? (
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('providers.ollamaBaseUrl')}</label>
              <input
                type="text"
                value={state.ollama.baseUrl}
                onChange={(e) => updateOllama('baseUrl', e.target.value)}
                placeholder={ollamaEndpoint ?? 'http://ollamarun-svc:11434'}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('providers.ollamaBaseUrlHint')}
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('providers.ollamaApiKey')}</label>
              <input
                type="text"
                value={state.ollama.apiKey}
                onChange={(e) => updateOllama('apiKey', e.target.value)}
                placeholder="ollama"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            {t('providers.ollamaHint')}
          </p>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="border-t" />

      {/* ── ClawRouter (Decentralized) ── */}
      <div className={!clawRouterInstalled ? 'opacity-50' : ''}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">{t('providers.clawrouter')}</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={state.useClawRouter}
              onChange={(e) => toggleClawRouter(e.target.checked)}
              disabled={!clawRouterInstalled}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-40" />
            <span className="ml-2 text-xs text-gray-500">
              {!clawRouterInstalled ? t('providers.disabled') : state.useClawRouter ? t('providers.enabled') : t('providers.disabled')}
            </span>
          </label>
        </div>
        <p className="text-xs text-gray-400">
          {!clawRouterInstalled
            ? t('providers.clawrouterNotInstalled')
            : state.useClawRouter
              ? t('providers.clawrouterHint')
              : t('providers.clawrouterEnableHint')}
        </p>
      </div>
    </div>
  );
}
