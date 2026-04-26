import { useState, useRef } from 'react';

export default function SearchBar({ beaches = [], onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const results = query.trim().length > 0
    ? beaches.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : [];

  const handleSelect = (beach) => {
    onSelect(beach._id);
    setQuery('');
    setOpen(false);
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const handleFocus = () => {
    clearTimeout(blurTimer.current);
    if (query.trim()) setOpen(true);
  };

  return (
    <div className="search-container">
      <div className="search-input-wrapper glass-card">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder="Search beaches..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {query && (
          <button className="search-clear" onClick={() => { setQuery(''); setOpen(false); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="search-dropdown glass-card">
          {results.map(beach => (
            <div key={beach._id} className="search-result" onMouseDown={() => handleSelect(beach)}>
              <div className="search-result-name">{beach.name}</div>
              <div className="search-result-dist">{beach.distance} away</div>
            </div>
          ))}
        </div>
      )}

      {open && query.trim().length > 0 && results.length === 0 && (
        <div className="search-dropdown glass-card">
          <div className="search-no-results">No beaches found</div>
        </div>
      )}
    </div>
  );
}
