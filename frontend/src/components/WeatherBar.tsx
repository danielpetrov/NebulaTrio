import React from 'react';
import { WeatherData } from '../hooks/useWeather';

interface WeatherBarProps {
  data: WeatherData;
  marineData: any;
  activityMode: 'beach' | 'offshore';
}

const S = { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { display: 'inline', verticalAlign: 'middle' } };

function ArrowUp() {
  return <svg {...S}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
}
function ArrowDown() {
  return <svg {...S}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
}
function ArrowRight() {
  return <svg {...S}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
}
function RiskDot({ color }: { color: string }) {
  return <svg width="9" height="9" viewBox="0 0 10 10" style={{ display: 'inline', verticalAlign: 'middle' }}><circle cx="5" cy="5" r="5" fill={color}/></svg>;
}

export default function WeatherBar({ data, marineData, activityMode }: WeatherBarProps) {
  const { forecast, rain } = data;

  const lower = forecast.toLowerCase();
  const isStorm = ['storm', 'thunder', 'worsening', 'deteriorat'].some(kw => lower.includes(kw));
  const isRain = ['rain', 'shower', 'drizzle'].some(kw => lower.includes(kw)) || rain > 0;

  let riskLevel: string;
  let riskColor: string;
  let messages: string[];
  let TrendIcon: React.FC;
  let trendText: string;

  if (isStorm) {
    riskLevel = 'AVOID';    riskColor = '#ff4444';
    TrendIcon = ArrowDown;
    trendText = 'Worsening';
    messages = ['Pollution detected', 'Strong currents'];
  } else if (isRain) {
    riskLevel = 'CAUTION';
    riskColor = '#ffcc00';
    TrendIcon = ArrowRight;
    trendText = 'Stable';
    messages = ['Waves rising', 'Rain incoming'];
  } else {
    riskLevel = 'SAFE';
    riskColor = '#4cd964';
    TrendIcon = ArrowUp;
    trendText = 'Improving';
    messages = [activityMode === 'beach' ? 'Swimming OK' : 'Fishing OK'];
  }

  const confidence = 82;

  return (
    <div className="status-bar glass-card">
      <span className="status-bar-risk">
        <RiskDot color={riskColor} /> {riskLevel}
      </span>
      <span className="status-bar-dot">•</span>
      {messages.map((msg, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="status-bar-dot">•</span>}
          <span className="status-bar-message">{msg}</span>
        </React.Fragment>
      ))}
      <span className="status-bar-dot">•</span>
      <span className="status-bar-trend">
        <TrendIcon /> {trendText}
      </span>
      <span className="status-bar-dot">•</span>
      <span className="status-bar-confidence">Confidence {confidence}%</span>
    </div>
  );
}
