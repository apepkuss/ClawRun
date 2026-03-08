import React from 'react';
import { useLocale } from '../locales';

export interface InstallOption {
  label: string;
  onClick: () => void;
}

interface Props {
  name: string;
  healthy: boolean;
  endpoint: string | null;
  installState: string | null;
  installProgress: string | null;
  replicas: { desired: number; ready: number } | null;
  onUninstall: () => void;
  onOpen?: () => void;
  installOptions?: InstallOption[];
  busy?: string;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const STATE_MAP: Record<string, { key: string; color: 'amber' | 'red' }> = {
  pending:          { key: 'status.pending', color: 'amber' },
  downloading:      { key: 'status.downloading', color: 'amber' },
  installing:       { key: 'status.installing', color: 'amber' },
  initializing:     { key: 'status.initializing', color: 'amber' },
  downloadFailed:   { key: 'status.downloadFailed', color: 'red' },
  installFailed:    { key: 'status.installFailed', color: 'red' },
  uninstalling:     { key: 'status.uninstalling', color: 'amber' },
  resuming:         { key: 'status.resuming', color: 'amber' },
  suspending:       { key: 'status.suspending', color: 'amber' },
  upgrading:        { key: 'status.upgrading', color: 'amber' },
};

export function AppCard({ name, healthy, endpoint, installState, installProgress, replicas, onUninstall, onOpen, installOptions, busy }: Props) {
  const { t } = useLocale();

  const stateInfo = installState ? STATE_MAP[installState] : null;
  const isInProgress = busy || (stateInfo && stateInfo.color === 'amber');
  const isFailed = stateInfo && stateInfo.color === 'red';
  const isRunningCrd = installState === 'running';
  const showInstall = !healthy && !isInProgress && !isFailed && !isRunningCrd && installOptions && installOptions.length > 0;

  let badgeClass: string;
  let badgeText: string;
  let showSpinner = false;

  if (busy) {
    badgeClass = 'bg-amber-100 text-amber-700';
    badgeText = busy;
    showSpinner = true;
  } else if (isFailed) {
    badgeClass = 'bg-red-100 text-red-700';
    badgeText = t(stateInfo!.key);
  } else if (isInProgress) {
    badgeClass = 'bg-amber-100 text-amber-700';
    const pct = installProgress ? parseFloat(installProgress) : 0;
    const stateText = t(stateInfo!.key);
    badgeText = pct > 0 && pct < 100 ? `${stateText} ${pct.toFixed(1)}%` : stateText;
    showSpinner = true;
  } else if (isRunningCrd && !healthy) {
    if (replicas && replicas.desired === 0) {
      badgeClass = 'bg-gray-200 text-gray-600';
      badgeText = t('status.stopped');
    } else {
      badgeClass = 'bg-amber-100 text-amber-700';
      badgeText = t('status.starting');
      showSpinner = true;
    }
  } else if (healthy) {
    badgeClass = 'bg-green-100 text-green-700';
    badgeText = t('status.running');
  } else {
    badgeClass = 'bg-gray-100 text-gray-500';
    badgeText = t('status.offline');
  }

  return (
    <div className="border rounded-xl p-5 flex flex-col gap-3 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-lg capitalize">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${badgeClass}`}>
          {showSpinner && <Spinner />}
          {badgeText}
        </span>
      </div>
      {endpoint && (
        <p className="text-xs text-gray-400 truncate">{endpoint}</p>
      )}
      <div className="flex flex-col gap-2 mt-1">
        {isFailed ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-red-500">{t('app.failedCheckMarket', { state: t(stateInfo!.key) })}</p>
            <button
              onClick={onUninstall}
              className="w-full text-sm py-1.5 rounded-lg border border-red-400 text-red-500 hover:bg-red-50"
            >
              {t('common.uninstall')}
            </button>
          </div>
        ) : (isInProgress || busy || (isRunningCrd && !healthy && !(replicas && replicas.desired === 0))) ? (
          (() => {
            const pct = installProgress ? parseFloat(installProgress) : 0;
            const hasRealProgress = pct > 0 && pct < 100;
            return (
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-amber-400 rounded-full transition-all duration-500 ${hasRealProgress ? '' : 'animate-pulse'}`}
                  style={{ width: hasRealProgress ? `${pct}%` : '100%' }}
                />
              </div>
            );
          })()
        ) : showInstall ? (
          <div className="flex gap-2">
            {installOptions!.map((opt) => (
              <button
                key={opt.label}
                onClick={opt.onClick}
                className="flex-1 text-sm py-1.5 rounded-lg border border-green-500 text-green-600 hover:bg-green-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            {onOpen && (
              <button
                onClick={onOpen}
                disabled={!healthy}
                className="flex-1 text-sm py-1.5 rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('common.open')}
              </button>
            )}
            <button
              onClick={onUninstall}
              className="flex-1 text-sm py-1.5 rounded-lg border border-red-400 text-red-500 hover:bg-red-50"
            >
              {t('common.uninstall')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
