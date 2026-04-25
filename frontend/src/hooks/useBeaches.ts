import { useState, useEffect } from 'react';

// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface BeachLocation {
  _id: string;
  name: string;
  lat: number;
  lon: number;
  score: number;
  status: string;
  type: string;
  group: string;
  distance?: string;
}

export function useBeaches() {
  const [beaches, setBeaches] = useState<BeachLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchBeaches() {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/beaches`);
        if (!response.ok) throw new Error('Failed to fetch locations');
        const data = await response.json();

        if (isMounted) {
          const parsed = data.map((item: any) => {
            const coords = item.coordinates?.coordinates || [43.2, 27.9];
            const score = item.score || Math.floor(Math.random() * 30) + 60;
            return {
              _id: item._id,
              name: item.name,
              lat: coords[0],
              lon: coords[1],
              score,
              status: score >= 80 ? 'Excellent' : 'Good',
              type: item.type,
              group: item.group || item._id,
            };
          });
          setBeaches(parsed);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchBeaches();
    return () => { isMounted = false; };
  }, []);

  return { beaches, loading, error };
}
