import React, { useState } from 'react';
import { useLocale } from '../locales';

interface Props {
  label: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  onConnect: (values: Record<string, string>) => Promise<void>;
  initialValues?: Record<string, string>;
}

export function ConnectPanel({ label, fields, onConnect, initialValues }: Props) {
  const { t } = useLocale();
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await onConnect(values);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
      <h3 className="font-medium text-gray-700">{label}</h3>
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{f.label}</label>
          <input
            type={f.type ?? 'text'}
            placeholder={f.placeholder}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      ))}
      <button
        type="submit"
        disabled={saving}
        className="mt-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? t('common.saving') : saved ? t('common.saved') : t('common.save')}
      </button>
    </form>
  );
}
