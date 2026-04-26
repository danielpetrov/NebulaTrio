import { useState, useEffect } from 'react';

// @ts-ignore
const DATA_API = import.meta.env.VITE_DATA_API_URL || 'https://nebulatrio-production.up.railway.app';

export interface ScoreData {
  score: number;
  flag: 'green' | 'amber' | 'red';
  interpretation: string;
  credible_interval_95: [number, number];
}

export function useScore(beachId: string | null, mode: 'bath' | 'offshore', refreshKey = 0) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!beachId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const endpoint = mode === 'bath' ? 'bath-score' : 'offshore-score';
    fetch(`${DATA_API}/beaches/${beachId}/${endpoint}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled && json) setData(json); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [beachId, mode, refreshKey]);

  return { data, loading };
}

// Fetch scores for multiple beaches in parallel — returns Map<beachId, ScoreData>
export function useAllScores(
  pairs: Array<{ beachId: string; scoreId: string | null }>,
  mode: 'bath' | 'offshore',
  refreshKey = 0
) {
  const [scores, setScores] = useState<Record<string, ScoreData>>({});
  const key = pairs.map(p => p.scoreId).join(',') + mode + refreshKey;

  useEffect(() => {
    if (!pairs.length) return;
    let cancelled = false;
    const endpoint = mode === 'bath' ? 'bath-score' : 'offshore-score';

    Promise.all(
      pairs.map(({ scoreId }) =>
        scoreId
          ? fetch(`${DATA_API}/beaches/${scoreId}/${endpoint}`).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null)
      )
    ).then(results => {
      if (cancelled) return;
      const m: Record<string, ScoreData> = {};
      pairs.forEach(({ beachId }, i) => {
        if (results[i]) m[beachId] = results[i];
      });
      setScores(m);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { scores };
}
