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
  const isTemperature = data.icon === 'temperature';
  return (
    <>
      <div>
        <div className="metric-header">
          <div className="metric-icon">
            <MetricIcon type={data.icon} />
          </div>
          <div className="metric-name">{data.name}</div>
        </div>
        {isTemperature ? (
          <div className="metric-temp-split">
            <div className="metric-temp-row">
              <span className="metric-temp-label">Air</span>
              <span className="metric-temp-value">{data.value}<span className="metric-temp-unit">{data.unit}</span></span>
            </div>
            <div className="metric-temp-row">
              <span className="metric-temp-label">Water</span>
              <span className="metric-temp-value">{data.waterTemp ?? '—'}<span className="metric-temp-unit">{data.unit}</span></span>
            </div>
          </div>
        ) : (
          <>
            <div className="metric-value">{data.value}</div>
            <div className="metric-unit">{data.unit}</div>
          </>
        )}
        {data.prediction && (
          <div className="metric-prediction">
            → {data.prediction}
          </div>
        )}
      </div>
      <div className={`metric-status ${data.statusClass}`}>{data.status}</div>
    </>
  );
}

function MapCardContent({ data }) {
  const lat = data.lat || 43.2141;
  const lng = data.lon || 27.9147;
  const token = process.env.VITE_MAPBOX_TOKEN || 'MAPBOX_TOKEN';
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lng},${lat},13,0/400x250?access_token=${token}`;

  return (
    <div 
      className="satellite-map"
      style={{ backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="satellite-overlay" />
      <div className="map-label">{data.stationLabel}</div>

      <div className="map-satellite-badge">
        <span className="map-satellite-icon">🛰️</span>
        <span className="map-satellite-text">ACTIVE</span>
        <span className="map-anomaly-badge map-anomaly--low">anomaly: low</span>
      </div>

      <div className="map-marker">
        <div className="marker-pulse" />
        <div className="marker-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="marker-dot" />
      </div>
      <div className="map-coordinates-row">
        <div className="map-coordinates">{data.coordinates}</div>
        <div className={`map-ais${data.vesselRisk === 'ship_activity' ? ' map-ais--alert' : ''}`}>
          🚢 ships nearby: {data.shipCount ?? '—'}
          {data.vesselRisk === 'ship_activity' && <span className="map-ais-risk"> · risk</span>}
        </div>
      </div>
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

const SENTINEL_LABEL = { green: 'Good', amber: 'Elevated', red: 'High Risk' };
const SENTINEL_CLASS = { green: 'status-good', amber: 'status-moderate', red: 'status-warning' };
const SENTINEL_SCORE = { green: 85, amber: 60, red: 35 };

function BeachCardContent({ data, sentinelScore }) {
  const score = sentinelScore ? SENTINEL_SCORE[sentinelScore] : data.score;
  const label = sentinelScore ? SENTINEL_LABEL[sentinelScore] : data.status;
  const cls   = sentinelScore ? SENTINEL_CLASS[sentinelScore] : (data.score >= 80 ? 'status-good' : 'status-moderate');
  return (
    <>
      <div>
        <div className="beach-name">{data.name}</div>
        <div className="beach-distance">{data.distance} away</div>
      </div>
      <div className="beach-score-row">
        <div>
          <div className="beach-score">{score}</div>
          <div className="beach-score-label">Quality</div>
        </div>
        <div className={`metric-status ${cls}`}>{label}</div>
      </div>
    </>
  );
}

function SkeletonCardContent() {
  return (
    <>
      <div>
        <div className="metric-header">
          <div className="metric-icon skeleton-shimmer" style={{ borderRadius: '8px' }} />
          <div className="metric-name skeleton-shimmer" style={{ width: '55%' }}>&nbsp;</div>
        </div>
        <div className="metric-value skeleton-shimmer" style={{ width: '45%' }}>&nbsp;</div>
        <div className="metric-unit skeleton-shimmer" style={{ marginTop: '6px', width: '60%' }}>&nbsp;</div>
        <div className="metric-prediction skeleton-shimmer" style={{ marginTop: '6px', width: '50%' }}>&nbsp;</div>
      </div>
      <div className="metric-status status-good skeleton-shimmer" style={{ width: '52%' }}>&nbsp;</div>
    </>
  );
}

const VALID_STATUS = new Set(['status-good', 'status-moderate', 'status-warning']);
const ACTIVITY_TO_STATUS = { high: 'status-good', moderate: 'status-moderate', low: 'status-warning', good: 'status-good', elevated: 'status-moderate', warning: 'status-warning' };

function resolveActivityClass(activityClass, activity) {
  if (VALID_STATUS.has(activityClass)) return activityClass;
  return ACTIVITY_TO_STATUS[(activity ?? '').toLowerCase()] ?? 'status-good';
}

function MarineCardContent({ data, locationName }) {
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <div className="info-title">Marine Life Activity</div>
      <div className="current-time">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Current time: {timeString} · {dateString} · {locationName || 'Unknown Location'}
      </div>
      {data.map((species) => (
        <div key={species.id} className="marine-species">
          <div className="marine-header">
            <div className="marine-name-section">
              <div className="marine-species-name">{species.species}</div>
              <div className="marine-scientific-name">{species.scientificName}</div>
            </div>
            <div className={`metric-status ${resolveActivityClass(species.activityClass, species.activity)}`}>{species.activity}</div>
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
  skeleton: 'card--skeleton',
};

export default function Card({
  variant,
  data,
  sentinelScore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onClick,
  locationName,
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
      {variant === 'beach'  && <BeachCardContent data={data} sentinelScore={sentinelScore} />}
      {variant === 'marine' && <MarineCardContent data={data} locationName={locationName} />}
      {variant === 'skeleton' && <SkeletonCardContent />}
    </div>
  );
}
