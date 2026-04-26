import { useState, useEffect } from 'react';
import MetricIcon from './MetricIcons.jsx';

function AiIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 1l2.09 6.26L20.5 9l-6.41 1.74L12 17l-2.09-6.26L3.5 9l6.41-1.74Z" />
      <path d="M19 2l.9 2.7L22.6 5.6l-2.7.9L19 9l-.9-2.7L15.4 5.6l2.7-.9Z" opacity="0.6" />
      <path d="M5 16l.7 2.1 2.1.7-2.1.7L5 21.5l-.7-2.1-2.1-.7 2.1-.7Z" opacity="0.5" />
    </svg>
  );
}

const SVG_PROPS = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function SatelliteIcon() {
  return (
    <svg {...SVG_PROPS}>
      <path d="m4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  );
}

function ShipIcon() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M2 12h20M4 12l2 6h12l2-6"/>
      <path d="M8 12V6h8v6"/>
      <path d="M12 6V3"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...SVG_PROPS} width={13} height={13}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

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
        </div>
      </div>
      {data.hook && <div className="score-hook">{data.hook}</div>}
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
        <span className="map-satellite-icon"><SatelliteIcon /></span>
        <span className="map-satellite-text">ACTIVE</span>
        <span className="map-anomaly-badge map-anomaly--low">anomaly: none</span>
      </div>

      <div className="map-marker">
        <div className="marker-pulse" />
        <div className="marker-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="marker-dot" />
      </div>
      <div className="map-zone-row">
        {data.zoneLabel && <span className="map-zone-badge">{data.zoneLabel}</span>}
        {data.distanceLabel && <span className="map-distance-badge">{data.distanceLabel}</span>}
      </div>
      <div className="map-coordinates-row">
        <div className="map-coordinates">{data.coordinates}</div>
        <div className={`map-ais${data.vesselRisk === 'ship_activity' ? ' map-ais--alert' : ''}`}>
          <ShipIcon /> ships nearby: {data.shipCount ?? '—'}
          {data.vesselRisk === 'ship_activity' && <span className="map-ais-risk"> · risk</span>}
        </div>
      </div>
    </div>
  );
}

function InfoCardContent({ data }) {
  return (
    <>
      <div className="info-title">
        {data.title}
        <span className="ai-badge"><AiIcon size={12} /> AI</span>
      </div>
      <div className="info-text">{data.text}</div>
    </>
  );
}

const SENTINEL_LABEL = { green: 'Good', amber: 'Elevated', red: 'High Risk' };
const SENTINEL_CLASS = { green: 'status-good', amber: 'status-moderate', red: 'status-warning' };
const SENTINEL_SCORE = { green: 85, amber: 60, red: 35 };

const FLAG_CLASS = { green: 'status-good', amber: 'status-moderate', red: 'status-warning' };
const FLAG_LABEL = { green: 'Good', amber: 'Elevated', red: 'High Risk' };

function BeachCardContent({ data, sentinelScore, numericScore, scoreFlag }) {
  let score, label, cls;
  if (numericScore != null && scoreFlag) {
    score = numericScore;
    label = FLAG_LABEL[scoreFlag] ?? 'Good';
    cls   = FLAG_CLASS[scoreFlag] ?? 'status-good';
  } else if (sentinelScore) {
    score = SENTINEL_SCORE[sentinelScore];
    label = SENTINEL_LABEL[sentinelScore];
    cls   = SENTINEL_CLASS[sentinelScore];
  } else {
    score = data.score;
    label = data.status;
    cls   = data.score >= 80 ? 'status-good' : 'status-moderate';
  }
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
      <div className="info-title">
        Marine Life Activity
        <span className="ai-badge"><AiIcon size={12} /> AI</span>
      </div>
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
          <div className="marine-seasonal"><CalendarIcon /> {species.seasonalNote}</div>
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
  numericScore,
  scoreFlag,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onClick,
  locationName,
  isDragOver,
}) {
  const dragProps = variant === 'metric'
    ? { draggable: true, onDragStart, onDragEnd, onDragOver, onDrop }
    : {};

  const clickProps = (variant === 'metric' || variant === 'beach') && onClick
    ? { onClick }
    : {};

  const dragOverStyle = isDragOver
    ? { outline: '2px solid rgba(0,212,255,0.7)', transform: 'scale(1.03)', transition: 'transform 0.15s, outline 0.15s' }
    : {};

  return (
    <div className={`glass-card ${VARIANT_CLASSES[variant] ?? ''}`} style={dragOverStyle} {...dragProps} {...clickProps}>
      {variant === 'score'  && <ScoreCardContent data={data} />}
      {variant === 'metric' && <MetricCardContent data={data} />}
      {variant === 'map'    && <MapCardContent data={data} />}
      {variant === 'info'   && <InfoCardContent data={data} />}
      {variant === 'beach'  && <BeachCardContent data={data} sentinelScore={sentinelScore} numericScore={numericScore} scoreFlag={scoreFlag} />}
      {variant === 'marine' && <MarineCardContent data={data} locationName={locationName} />}
      {variant === 'skeleton' && <SkeletonCardContent />}
    </div>
  );
}
