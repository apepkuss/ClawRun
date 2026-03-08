import React, { useState } from 'react';
import { useLocale } from '../../locales';
import { CHANNELS } from './constants';
import type { WizardState } from './types';

interface Props {
  state: WizardState;
  onChange: (s: WizardState) => void;
}

export function StepChannels({ state, onChange }: Props) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);

  function setField(channelId: string, fieldKey: string, value: string) {
    const current = state.channels[channelId] ?? {};
    onChange({
      ...state,
      channels: {
        ...state.channels,
        [channelId]: { ...current, [fieldKey]: value },
      },
    });
  }

  function hasConfig(channelId: string): boolean {
    const ch = state.channels[channelId];
    if (!ch) return false;
    return Object.values(ch).some((v) => v.trim());
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {t('channels.description')}
      </p>
      {CHANNELS.map((ch) => {
        const isOpen = expanded === ch.id;
        const configured = hasConfig(ch.id);
        const channelName = t('channel.' + ch.id);

        if (ch.fields.length === 0) {
          return (
            <div key={ch.id} className="border rounded-lg px-4 py-3 text-sm text-gray-400">
              {t('channels.comingSoon', { name: channelName })}
            </div>
          );
        }

        return (
          <div key={ch.id} className="border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : ch.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">{channelName}</span>
              <div className="flex items-center gap-2">
                {configured && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {t('channels.configured')}
                  </span>
                )}
                <span className="text-gray-400 text-xs">{isOpen ? '\u25B2' : '\u25BC'}</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 border-t bg-gray-50 space-y-2">
                {ch.fields.map((f) => (
                  <div key={f.key} className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input
                      type={f.type ?? 'text'}
                      value={state.channels[ch.id]?.[f.key] ?? ''}
                      onChange={(e) => setField(ch.id, f.key, e.target.value)}
                      placeholder={t('channels.enterField', { label: f.label })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
