import { useMemo } from 'react';
import MetricIcon from './MetricIcons.jsx';

function TempHistoryChart({ history }) {
  const points = useMemo(() => history.filter(p => p.water_temp_c != null), [history]);
  if (points.length < 2) return null;

  const W = 480, H = 120, PAD = { top: 12, right: 12, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const temps = points.map(p => p.water_temp_c);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const range = maxT - minT || 1;

  const toX = (i) => PAD.left + (i / (points.length - 1)) * innerW;
  const toY = (t) => PAD.top + innerH - ((t - minT) / range) * innerH;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.water_temp_c).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // X-axis labels: show ~5 evenly spaced timestamps
  const labelCount = Math.min(5, points.length);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round(i * (points.length - 1) / (labelCount - 1))
  );

  // Y-axis ticks: 3 values
  const yTicks = [minT, (minT + maxT) / 2, maxT];

  return (
    <div className="temp-chart-container">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={PAD.left} y1={toY(t).toFixed(1)}
            x2={PAD.left + innerW} y2={toY(t).toFixed(1)}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#tempGrad)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text
            key={i}
            x={PAD.left - 6} y={toY(t) + 4}
            fill="rgba(255,255,255,0.45)" fontSize="9" textAnchor="end"
          >
            {t.toFixed(1)}°
          </text>
        ))}

        {/* X-axis labels */}
        {labelIndices.map((idx) => {
          const ts = new Date(points[idx].timestamp);
          const label = isNaN(ts) ? '' : ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <text
              key={idx}
              x={toX(idx)} y={H - 4}
              fill="rgba(255,255,255,0.35)" fontSize="9" textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function MetricModal({ metric, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-section">
            <div className="modal-icon">
              <MetricIcon type={metric.icon} size="large" />
            </div>
            <div className="modal-title">{metric.fullName}</div>
            <div className="modal-subtitle">{metric.name}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="modal-current-value">
            <div className="modal-value-label">Current Reading</div>
            <div className="modal-value">
              {metric.value}
              <span className="modal-value-unit">{metric.unit}</span>
            </div>
            {metric.icon === 'temperature' && metric.waterTemp != null && (
              <div className="modal-water-temp">
                Water <span>{metric.waterTemp}°C</span>
              </div>
            )}
            <div className={`metric-status ${metric.statusClass}`} style={{ marginTop: '12px' }}>
              {metric.status}
            </div>
          </div>

          {metric.icon === 'temperature' && metric.tempHistory?.length >= 2 && (
            <div className="modal-section">
              <div className="modal-section-title">Water Temperature History</div>
              <TempHistoryChart history={metric.tempHistory} />
            </div>
          )}

          <div className="modal-section">
            <div className="modal-section-title">Why It Matters</div>
            <div className="modal-section-content">{metric.importance}</div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">How We Measure It</div>
            <div className="modal-section-content">{metric.measurement}</div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Ideal Range</div>
            <div className="modal-ideal-range">{metric.idealRange}</div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Current Analysis</div>
            <div className="modal-section-content">{metric.currentAnalysis}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
