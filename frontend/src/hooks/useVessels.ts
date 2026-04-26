import { useState, useEffect } from 'react';

// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface VesselData {
  shipCount: number;
  ships: { lat: number; lng: number; speed: number; course: number }[];
  risk: 'ship_activity' | 'clear';
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  timestamp: string;
}

export function useVessels(
  shore: { lat: number; lng: number } | null,
  offshore: { lat: number; lng: number } | null
) {
  const [data, setData] = useState<VesselData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shore) return;

    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(`${API_URL}/vessels-nearby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shore, offshore }),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => { if (!cancelled) setData(json); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [shore?.lat, shore?.lng, offshore?.lat, offshore?.lng]);

  return { data, loading, error };
}
