import React from 'react';
import { WeatherData } from '../hooks/useWeather';

interface WeatherBarProps {
  data: WeatherData;
  marineData: any;
  activityMode: 'beach' | 'offshore';
}

export default function WeatherBar({ data, marineData, activityMode }: WeatherBarProps) {
  const { forecast, rain } = data;
  
  const lower = forecast.toLowerCase();
  const isStorm = ['storm', 'thunder', 'worsening', 'deteriorat'].some(kw => lower.includes(kw));
  const isRain = ['rain', 'shower', 'drizzle'].some(kw => lower.includes(kw)) || rain > 0;

  let riskLevel = 'SAFE';
  let riskIcon = '🟢';
  let messages: string[] = [];
  let trendIcon = '⬆';
  let trendText = 'Improving';

  if (isStorm) {
    riskLevel = 'AVOID';
    riskIcon = '🔴';
    trendIcon = '⬇';
    trendText = 'Worsening';
    messages = ['Pollution detected', 'Strong currents'];
  } else if (isRain) {
    riskLevel = 'CAUTION';
    riskIcon = '🟡';
    trendIcon = '➔';
    trendText = 'Stable';
    messages = ['Waves ⬆', 'Rain incoming'];
  } else {
    riskLevel = 'SAFE';
    riskIcon = '🟢';
    trendIcon = '⬆';
    trendText = 'Improving';
    messages = [activityMode === 'beach' ? 'Swimming OK' : 'Fishing OK'];
  }

  const confidence = 82; // Mock confidence

  return (
    <div className="status-bar glass-card">
      {messages.map((msg, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="status-bar-dot">•</span>}
          <span className="status-bar-message">{msg}</span>
        </React.Fragment>
      ))}
      <span className="status-bar-dot">•</span>
      <span className="status-bar-trend">
        {trendIcon} {trendText}
      </span>
      <span className="status-bar-dot">•</span>
      <span className="status-bar-confidence">Confidence {confidence}%</span>
    </div>
  );
}
