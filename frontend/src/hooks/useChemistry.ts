import { useState, useEffect } from 'react';

// @ts-ignore
const DATA_API = import.meta.env.VITE_DATA_API_URL || 'https://nebulatrio-production.up.railway.app';

export interface ChemistryLatest {
  timestamp: string;
  ph: number | null;
  o2: number | null;
  no3: number | null;
  po4: number | null;
  nppv: number | null;
}

export interface ChemistryData {
  beach_id: string;
  latest: ChemistryLatest;
  history: ChemistryLatest[];
}

export function useChemistry(beachId: string | null, refreshKey = 0) {
  const [data, setData] = useState<ChemistryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!beachId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`${DATA_API}/beaches/${beachId}/chemistry?days_back=7`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled && json) setData(json); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [beachId, refreshKey]);

  return { data, loading };
}
