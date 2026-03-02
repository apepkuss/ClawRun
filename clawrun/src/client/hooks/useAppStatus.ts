import { useState, useEffect } from 'react';

export interface AppStatus {
  openclaw: { healthy: boolean; endpoint: string | null; uiUrl: string | null };
  ollama: { healthy: boolean; endpoint: string | null };
}

const POLL_INTERVAL = 10_000;

export function useAppStatus() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetch_() {
      try {
        const res = await fetch('/api/status');
        if (!cancelled) {
          setStatus(await res.json() as AppStatus);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void fetch_();
    const id = setInterval(() => { void fetch_(); }, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function refresh() {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setStatus(data as AppStatus))
      .catch(() => {});
  }

  return { status, loading, refresh };
}
