import { useState, useEffect } from 'react';
import { getWeather } from '../api/weather';

export interface WeatherData {
  rain: number;
  wind_speed: number;
  wind_dir: string;
  humidity: number;
  forecast: string;
  temp: number | null;
}

export function useWeather(lat?: number, lon?: number): WeatherData {
  const [weatherData, setWeatherData] = useState<WeatherData>({
    rain: 0,
    wind_speed: 0,
    wind_dir: 'N',
    humidity: 0,
    forecast: 'Loading...',
    temp: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchWeather() {
      if (lat === undefined || lon === undefined) return;

      setWeatherData((prev) => ({ ...prev, forecast: 'Loading...' }));

      try {
        const data = await getWeather(lat, lon);
        if (!isMounted) return;

        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const dir = dirs[Math.round(data.weather.wind_deg / 45) % 8];
        const isRaining = data.forecast.rain_next_3h > 0 || data.weather.rain > 0;

        setWeatherData({
          rain: data.weather.rain,
          wind_speed: data.weather.wind_speed,
          wind_dir: dir,
          humidity: data.weather.humidity,
          forecast: isRaining ? 'Rain expected in 3h' : 'Clear skies expected',
          temp: data.weather.temp,
        });
      } catch (error) {
        if (isMounted) {
          setWeatherData((prev) => ({ ...prev, forecast: 'Failed to load weather' }));
        }
      }
    }

    if (lat !== undefined && lon !== undefined) {
      fetchWeather();
    }

    return () => {
      isMounted = false;
    };
  }, [lat, lon]);

  return weatherData;
}
