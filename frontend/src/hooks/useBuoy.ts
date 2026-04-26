import { useState, useEffect } from 'react';

// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface BuoyData {
  water_temp_c: number | null;
  wave_height_m: number | null;
  wave_direction_deg: number | null;
  wave_state_beaufort: number | null;
  wind_speed_ms: number | null;
  wind_direction_deg: number | null;
  wave_trend: string;
  timestamp: string;
}

export function useBuoy(beachId: string | null, refreshKey = 0) {
  const [data, setData] = useState<BuoyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!beachId) { setLoading(false); return; }
    let cancelled = false;

    setLoading(true);
    fetch(`${API_URL}/buoy/${beachId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled && json) setData(json); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [beachId, refreshKey]);

  return { data, loading };
}
