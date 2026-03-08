import React, { useState, useEffect } from 'react';
import { useLocale } from './locales';
import { OllamaPanel } from './components/OllamaPanel';

export default function App() {
  const { locale, setLocale, t } = useLocale();
  const [healthy, setHealthy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/ollama/health');
        const data = await res.json() as { healthy: boolean };
        if (!cancelled) setHealthy(data.healthy);
      } catch {
        if (!cancelled) setHealthy(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void check();
    const id = setInterval(() => { void check(); }, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">OllamaRun</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-500">
                {loading ? t('app.detecting') : healthy ? t('app.running') : t('app.offline')}
              </span>
            </div>
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded border border-gray-200"
            >
              {locale === 'en' ? '中文' : 'EN'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <OllamaPanel healthy={healthy} />
        </div>
      </main>
    </div>
  );
}
