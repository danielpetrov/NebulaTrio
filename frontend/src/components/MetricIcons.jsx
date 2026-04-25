const BASE_PROPS = {
  width: '16',
  height: '16',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'white',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const MODAL_PROPS = {
  ...BASE_PROPS,
  width: '24',
  height: '24',
};

const ICONS = {
  oxygen: (props) => (
    <svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  phosphorus: (props) => (
    <svg {...props}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  nitrogen: (props) => (
    <svg {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  ph: (props) => (
    <svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  temperature: (props) => (
    <svg {...props}>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  ),
  turbidity: (props) => (
    <svg {...props}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
};

export default function MetricIcon({ type, size = 'small' }) {
  const Icon = ICONS[type];
  if (!Icon) return null;
  return <Icon {...(size === 'large' ? MODAL_PROPS : BASE_PROPS)} />;
}
