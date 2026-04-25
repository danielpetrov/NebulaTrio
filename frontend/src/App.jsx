import { useState, useEffect, useMemo } from 'react';
import BubblesBackground from './components/BubblesBackground.jsx';
import Card from './components/Card.jsx';
import MetricModal from './components/MetricModal.jsx';
import SearchBar from './components/SearchBar.jsx';
import WeatherBar from './components/WeatherBar';
import { useWeather } from './hooks/useWeather';
import { useMarine } from './hooks/useMarine';
import { useBeaches } from './hooks/useBeaches';
import { calculateDistance } from './utils/geo.js';
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

  const [userLocation, setUserLocation] = useState({ lat: 43.2141, lon: 27.9147 });
  const { beaches: fetchedBeaches, loading: beachesLoading, error: beachesError } = useBeaches();

  // All beaches with distance, sorted
  const processedBeaches = useMemo(() => {
    return fetchedBeaches.map(beach => {
      const dist = calculateDistance(userLocation.lat, userLocation.lon, beach.lat, beach.lon);
      return { ...beach, distance: `${dist} km`, distValue: dist };
    }).sort((a, b) => a.distValue - b.distValue);
  }, [fetchedBeaches, userLocation]);

  // Only beach-type for the nearby list
  const beachList = useMemo(() => processedBeaches.filter(b => b.type === 'beach'), [processedBeaches]);

  // Map: group -> offshore location
  const offshoreByGroup = useMemo(() => {
    const map = {};
    processedBeaches.filter(b => b.type === 'offshore').forEach(b => { map[b.group] = b; });
    return map;
  }, [processedBeaches]);

  const [selectedBeachId, setSelectedBeachId] = useState(null);
  const [isOffshore, setIsOffshore] = useState(false);

  useEffect(() => {
    if (beachList.length > 0) {
      const exists = beachList.find(b => b._id === selectedBeachId);
      if (!exists) {
        setSelectedBeachId(beachList[0]._id);
        setIsOffshore(false);
      }
    }
  }, [beachList, selectedBeachId]);

  const selectedBeach = beachList.find(b => b._id === selectedBeachId) || NEARBY_BEACHES[0];
  const offshoreForSelected = offshoreByGroup[selectedBeach?.group];
  const activeLocation = isOffshore && offshoreForSelected ? offshoreForSelected : selectedBeach;

  const activityMode = isOffshore && offshoreForSelected ? 'offshore' : 'beach';

  const weatherData = useWeather(activeLocation.lat, activeLocation.lon);
  const marineData = useMarine();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => console.warn('Geolocation warning:', error.message)
      );
    }
  }, []);

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

  const filteredBeaches = beachList.filter((b) =>
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
              {activeLocation.name}
            </div>

            {offshoreForSelected && (
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${!isOffshore ? 'active' : ''}`}
                  onClick={() => setIsOffshore(false)}
                >
                  🏖️ Beach
                </button>
                <button
                  className={`mode-btn ${isOffshore ? 'active' : ''}`}
                  onClick={() => setIsOffshore(true)}
                >
                  🎣 Offshore
                </button>
              </div>
            )}
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
            <Card variant="map" data={{ ...LOCATION_DATA, lat: activeLocation.lat, lon: activeLocation.lon, coordinates: `${activeLocation.lat}° N, ${activeLocation.lon}° E` }} />

            <div>
              <div className="section-title">
                Nearby Beaches
                {beachesLoading && <span style={{fontSize: 12, marginLeft: 10, color: '#aaa'}}>Loading...</span>}
              </div>
              <div className="beaches-grid">
                {beachesError && <div style={{ color: 'red', gridColumn: '1 / -1' }}>Error: {beachesError}</div>}
                {!beachesLoading && !beachesError && filteredBeaches.length === 0 && (
                  <div style={{ color: '#aaa', gridColumn: '1 / -1' }}>No beaches found.</div>
                )}
                {filteredBeaches.map((beach) => (
                  <div key={beach._id} onClick={() => { setSelectedBeachId(beach._id); setIsOffshore(false); }} style={{ cursor: 'pointer' }}>
                    <Card variant="beach" data={beach} />
                  </div>
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
