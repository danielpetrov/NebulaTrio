import { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:3000/api';

export function useMarine(metrics: any[], weatherData: any, activityMode: 'beach' | 'offshore', isReady: boolean) {
  const [marineData, setMarineData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const metricsStr = JSON.stringify(metrics);
  const weatherDataStr = JSON.stringify(weatherData);

  useEffect(() => {
    // Only fetch if data is ready, we are in offshore mode, and we have metrics
    if (!isReady || activityMode !== 'offshore' || !metrics || metrics.length === 0) {
      setMarineData(null);
      return;
    }

    const fetchMarine = async () => {
      setLoading(true);
      setError(null);

      try {
        const payload = {
          waterQuality: metrics,
          weatherData: weatherData,
          activityMode: activityMode,
        };

        const response = await fetch(`${API_BASE_URL}/marine/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Marine fetch failed');
        const data = await response.json();
        setMarineData(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchMarine();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [metricsStr, weatherDataStr, activityMode, isReady]);

  return marineData;
}
