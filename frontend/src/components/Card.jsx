import { useState, useEffect } from 'react';
import MetricIcon from './MetricIcons.jsx';

const CIRCUMFERENCE = 2 * Math.PI * 100; // r=100 → 628.32

function ScoreCardContent({ data }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const dashOffset = CIRCUMFERENCE * (1 - data.value / data.max);

  return (
    <div className="score-card-inner">
      <div className="score-label">Water Quality Index</div>
      <div className="score-circle-container">
        <svg className="score-circle-svg" viewBox="0 0 220 220">
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4CD964" stopOpacity="1" />
              <stop offset="100%" stopColor="#5AC8FA" stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
          <circle
            cx="110" cy="110" r="100"
            fill="none"
            stroke="url(#scoreGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={loaded ? dashOffset : CIRCUMFERENCE}
            transform="rotate(-90 110 110)"
            style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        <div className="score-value">
          <div className="score-number">
            {data.value}<span className="score-max">/{data.max}</span>
          </div>
          <div className="score-status">{data.status}</div>
        </div>
      </div>
    </div>
  );
}

function MetricCardContent({ data }) {
  return (
    <>
      <div>
        <div className="metric-header">
          <div className="metric-icon">
            <MetricIcon type={data.icon} />
          </div>
          <div className="metric-name">{data.name}</div>
        </div>
        <div className="metric-value">{data.value}</div>
        <div className="metric-unit">{data.unit}</div>
      </div>
      <div className={`metric-status ${data.statusClass}`}>{data.status}</div>
    </>
  );
}

function MapCardContent({ data }) {
  return (
    <div className="satellite-map">
      <div className="satellite-overlay" />
      <div className="map-label">{data.stationLabel}</div>
      <div className="map-marker">
        <div className="marker-pulse" />
        <div className="marker-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="marker-dot" />
      </div>
      <div className="map-coordinates">{data.coordinates}</div>
    </div>
  );
}

function InfoCardContent({ data }) {
  return (
    <>
      <div className="info-title">{data.title}</div>
      <div className="info-text">{data.text}</div>
    </>
  );
}

function BeachCardContent({ data }) {
  const scoreClass = data.score >= 80 ? 'status-good' : 'status-moderate';
  return (
    <>
      <div>
        <div className="beach-name">{data.name}</div>
        <div className="beach-distance">{data.distance} away</div>
      </div>
      <div className="beach-score-row">
        <div>
          <div className="beach-score">{data.score}</div>
          <div className="beach-score-label">Quality</div>
        </div>
        <div className={`metric-status ${scoreClass}`}>{data.status}</div>
      </div>
    </>
  );
}

function MarineCardContent({ data }) {
  return (
    <>
      <div className="info-title">Marine Life Activity</div>
      <div className="current-time">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Current time: 20:34 · April 25, 2026 · Varna, Bulgaria
      </div>
      {data.map((species) => (
        <div key={species.id} className="marine-species">
          <div className="marine-header">
            <div className="marine-name-section">
              <div className="marine-species-name">{species.species}</div>
              <div className="marine-scientific-name">{species.scientificName}</div>
            </div>
            <div className={`marine-activity ${species.activityClass}`}>{species.activity}</div>
          </div>
          <div className="marine-reason">{species.reason}</div>
          <div className="marine-seasonal">📅 {species.seasonalNote}</div>
        </div>
      ))}
    </>
  );
}

const VARIANT_CLASSES = {
  score:  'card--score',
  metric: 'card--metric',
  map:    'card--map',
  info:   'card--info',
  beach:  'card--beach',
  marine: 'card--marine',
};

export default function Card({
  variant,
  data,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onClick,
}) {
  const dragProps = variant === 'metric'
    ? { draggable: true, onDragStart, onDragEnd, onDragOver, onDrop }
    : {};

  const clickProps = (variant === 'metric' || variant === 'beach') && onClick
    ? { onClick }
    : {};

  return (
    <div className={`glass-card ${VARIANT_CLASSES[variant] ?? ''}`} {...dragProps} {...clickProps}>
      {variant === 'score'  && <ScoreCardContent data={data} />}
      {variant === 'metric' && <MetricCardContent data={data} />}
      {variant === 'map'    && <MapCardContent data={data} />}
      {variant === 'info'   && <InfoCardContent data={data} />}
      {variant === 'beach'  && <BeachCardContent data={data} />}
      {variant === 'marine' && <MarineCardContent data={data} />}
    </div>
  );
}
