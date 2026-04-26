import { useState, useEffect } from 'react';

// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface SentinelIndicator {
  current_value: number;
  score: 'green' | 'amber' | 'red';
  unit?: string;
}

export interface SentinelData {
  beach_id: string;
  observation_date: string;
  overall_score: 'green' | 'amber' | 'red';
  indicators: {
    tur?: SentinelIndicator;
    chl?: SentinelIndicator;
    spm?: SentinelIndicator;
  };
}

export function useSentinel(beachId: string | null) {
  const [data, setData] = useState<SentinelData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!beachId) return;
    let cancelled = false;

    setLoading(true);
    fetch(`${API_URL}/sentinel/${beachId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled && json) setData(json); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [beachId]);

  return { data, loading };
}

// Returns Map<beach_id, SentinelData> — re-fetches when refreshKey changes
export function useSentinelAll(refreshKey = 0) {
  const [map, setMap] = useState<Record<string, SentinelData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/sentinel`)
      .then(r => r.ok ? r.json() : [])
      .then((docs: SentinelData[]) => {
        if (cancelled) return;
        const m: Record<string, SentinelData> = {};
        docs.forEach(d => { m[d.beach_id] = d; });
        setMap(m);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return { map, loading };
}
