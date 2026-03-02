import React from 'react';

interface Props {
  name: string;
  healthy: boolean;
  endpoint: string | null;
  onUninstall: () => void;
  onOpen?: () => void;
}

export function AppCard({ name, healthy, endpoint, onUninstall, onOpen }: Props) {
  return (
    <div className="border rounded-xl p-5 flex flex-col gap-3 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-lg capitalize">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          healthy ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {healthy ? '运行中' : '离线'}
        </span>
      </div>
      {endpoint && (
        <p className="text-xs text-gray-400 truncate">{endpoint}</p>
      )}
      <div className="flex gap-2 mt-1">
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
    </div>
  );
}
