import { useState, useEffect } from 'react';
import BubblesBackground from './components/BubblesBackground.jsx';
import Card from './components/Card.jsx';
import MetricModal from './components/MetricModal.jsx';
import SearchBar from './components/SearchBar.jsx';
import WeatherBar from './components/WeatherBar';
import { useWeather } from './hooks/useWeather';
import { useMarine } from './hooks/useMarine';
import {
  SCORE_DATA,
  LOCATION_DATA,
  INFO_DATA,
  METRICS_DATA,
  NEARBY_BEACHES,
  MARINE_LIFE,
} from './data/mockData.js';
import './index.css';

export default function App() {
  const [metrics, setMetrics] = useState(METRICS_DATA);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollY, setScrollY] = useState(0);

  const [selectedBeach, setSelectedBeach] = useState(NEARBY_BEACHES[0]);
  const [activityMode, setActivityMode] = useState('beach'); // 'beach' | 'offshore'
  const weatherData = useWeather(selectedBeach.lat, selectedBeach.lon);
  const marineData = useMarine();

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedIndex(null);
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const reordered = [...metrics];
    const [dragged] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, dragged);
    setMetrics(reordered);
  };

  const filteredBeaches = NEARBY_BEACHES.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="gradient-bg" />
      <div
        className="gradient-overlay"
        style={{ opacity: Math.min(scrollY / 500, 0.6) }}
      />
      <BubblesBackground />

      <div className="aware-container">
        <header className="aware-header">
          <div className="logo">AWARE</div>
          <div className="location-group">
            <div className="location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {selectedBeach.name}
            </div>

            <div className="mode-toggle">
              <button 
                className={`mode-btn ${activityMode === 'beach' ? 'active' : ''}`}
                onClick={() => setActivityMode('beach')}
              >
                🏖️ Beach
              </button>
              <button 
                className={`mode-btn ${activityMode === 'offshore' ? 'active' : ''}`}
                onClick={() => setActivityMode('offshore')}
              >
                🎣 Offshore
              </button>
            </div>
          </div>
        </header>

        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <Card variant="score" data={SCORE_DATA} />

        <WeatherBar data={weatherData} marineData={marineData} activityMode={activityMode} />

        <div className="desktop-layout">
          <div className="left-column">
            <div className="metrics-grid">
              {metrics.map((metric, index) => (
                <Card
                  key={metric.id}
                  variant="metric"
                  data={metric}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onClick={() => setSelectedMetric(metric)}
                />
              ))}
            </div>

            <Card variant="marine" data={MARINE_LIFE} />
          </div>

          <div className="right-column">
            <Card variant="map" data={{ ...LOCATION_DATA, lat: selectedBeach.lat, lon: selectedBeach.lon, coordinates: `${selectedBeach.lat}° N, ${selectedBeach.lon}° E` }} />

            <div>
              <div className="section-title">Nearby Beaches</div>
              <div className="beaches-grid">
                {filteredBeaches.map((beach) => (
                  <Card 
                    key={beach.id} 
                    variant="beach" 
                    data={beach} 
                    onClick={() => setSelectedBeach(beach)} 
                  />
                ))}
              </div>
            </div>

            <Card variant="info" data={INFO_DATA} />
          </div>
        </div>

        <div className="timestamp">Last updated: Today at 14:32</div>
      </div>

      {selectedMetric && (
        <MetricModal
          metric={selectedMetric}
          onClose={() => setSelectedMetric(null)}
        />
      )}
    </>
  );
}
