import { useState, useEffect } from 'react';

export interface AppStatus {
  openclaw: { healthy: boolean; endpoint: string | null; uiUrl: string | null; token: string | null; installState: string | null; installProgress: string | null; replicas: { desired: number; ready: number } | null };
  ollama: { healthy: boolean; endpoint: string | null; variant: 'cpu' | 'gpu' | null };
}

const POLL_INTERVAL = 10_000;
const FAST_POLL_INTERVAL = 3_000;

export function useAppStatus() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fastPoll, setFastPoll] = useState(false);

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
    const interval = fastPoll ? FAST_POLL_INTERVAL : POLL_INTERVAL;
    const id = setInterval(() => { void fetch_(); }, interval);
    return () => { cancelled = true; clearInterval(id); };
  }, [fastPoll]);

  function refresh() {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setStatus(data as AppStatus))
      .catch(() => {});
  }

  return { status, loading, refresh, setFastPoll };
}
