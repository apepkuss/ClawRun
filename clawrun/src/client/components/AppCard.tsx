import React from 'react';

export interface InstallOption {
  label: string;
  onClick: () => void;
}

interface Props {
  name: string;
  healthy: boolean;
  endpoint: string | null;
  installState: string | null;
  installProgress: string | null; // e.g. "6.71", "100.00"
  onUninstall: () => void;
  onOpen?: () => void;
  installOptions?: InstallOption[];
  busy?: string; // only for brief "安装中…" / "卸载中…" during API call
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// Map CRD installState to display info
const STATE_MAP: Record<string, { text: string; color: 'amber' | 'red' }> = {
  pending:          { text: '等待中…', color: 'amber' },
  downloading:      { text: '下载中…', color: 'amber' },
  installing:       { text: '安装中…', color: 'amber' },
  initializing:     { text: '初始化中…', color: 'amber' },
  downloadFailed:   { text: '下载失败', color: 'red' },
  installFailed:    { text: '安装失败', color: 'red' },
  uninstalling:     { text: '卸载中…', color: 'amber' },
  resuming:         { text: '恢复中…', color: 'amber' },
  suspending:       { text: '暂停中…', color: 'amber' },
  upgrading:        { text: '升级中…', color: 'amber' },
};

export function AppCard({ name, healthy, endpoint, installState, installProgress, onUninstall, onOpen, installOptions, busy }: Props) {
  // Determine effective display state
  const stateInfo = installState ? STATE_MAP[installState] : null;
  const isInProgress = busy || (stateInfo && stateInfo.color === 'amber');
  const isFailed = stateInfo && stateInfo.color === 'red';
  const isRunningCrd = installState === 'running';
  const showInstall = !healthy && !isInProgress && !isFailed && !isRunningCrd && installOptions && installOptions.length > 0;

  // Status badge
  let badgeClass: string;
  let badgeText: string;
  let showSpinner = false;

  if (busy) {
    badgeClass = 'bg-amber-100 text-amber-700';
    badgeText = busy;
    showSpinner = true;
  } else if (isFailed) {
    badgeClass = 'bg-red-100 text-red-700';
    badgeText = stateInfo!.text;
  } else if (isInProgress) {
    badgeClass = 'bg-amber-100 text-amber-700';
    const pct = installProgress ? parseFloat(installProgress) : 0;
    badgeText = pct > 0 && pct < 100 ? `${stateInfo!.text} ${pct.toFixed(1)}%` : stateInfo!.text;
    showSpinner = true;
  } else if (isRunningCrd && !healthy) {
    badgeClass = 'bg-amber-100 text-amber-700';
    badgeText = '启动中…';
    showSpinner = true;
  } else if (healthy) {
    badgeClass = 'bg-green-100 text-green-700';
    badgeText = '运行中';
  } else {
    badgeClass = 'bg-gray-100 text-gray-500';
    badgeText = '离线';
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
          /* Failed state → show error message + uninstall */
          <div className="flex flex-col gap-2">
            <p className="text-xs text-red-500">{stateInfo!.text}，请检查 Olares 应用市场确认状态</p>
            <button
              onClick={onUninstall}
              className="w-full text-sm py-1.5 rounded-lg border border-red-400 text-red-500 hover:bg-red-50"
            >
              卸载
            </button>
          </div>
        ) : (isInProgress || busy || (isRunningCrd && !healthy)) ? (
          /* In progress → show progress bar */
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
          /* Offline with install options → show install button(s) only */
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
          /* Running or offline without install options → show Open UI + Uninstall */
          <div className="flex gap-2">
            {onOpen && (
              <button
                onClick={onOpen}
                disabled={!healthy}
                className="flex-1 text-sm py-1.5 rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                打开 UI
              </button>
            )}
            <button
              onClick={onUninstall}
              className="flex-1 text-sm py-1.5 rounded-lg border border-red-400 text-red-500 hover:bg-red-50"
            >
              卸载
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
