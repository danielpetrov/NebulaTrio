import { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:3000/api';

export function useAI(metrics: any[], marineLife: any[], weatherData: any, activityMode: 'beach' | 'offshore', isReady: boolean) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const metricsStr = JSON.stringify(metrics);
  const marineLifeStr = JSON.stringify(marineLife);
  const weatherDataStr = JSON.stringify(weatherData);

  // Reset immediately when mode switches so old data doesn't linger
  useEffect(() => {
    setData(null);
    setLoading(true);
  }, [activityMode]);

  useEffect(() => {
    // Only fetch if data is ready and we have valid metrics
    if (!isReady || !metrics || metrics.length === 0) return;

    const fetchSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const endpoint = activityMode === 'offshore' ? '/ai/summary/marine' : '/ai/summary/beach';
        const payload = {
          waterQuality: metrics,
          marineLife: activityMode === 'offshore' ? marineLife : undefined,
          beachConditions: activityMode === 'beach' ? weatherData : undefined,
        };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('AI fetch failed');
        const responseData = await response.json();
        setData(responseData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchSummary();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [metricsStr, marineLifeStr, weatherDataStr, activityMode, isReady]);

  return { data, loading, error };
}
