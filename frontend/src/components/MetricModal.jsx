import MetricIcon from './MetricIcons.jsx';

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
            <div className={`metric-status ${metric.statusClass}`} style={{ marginTop: '12px' }}>
              {metric.status}
            </div>
          </div>

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
