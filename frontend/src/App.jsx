import { useState, useEffect, useMemo } from 'react';
import BubblesBackground from './components/BubblesBackground.jsx';
import OceanBackground from './components/OceanBackground.jsx';
import Card from './components/Card.jsx';
import MetricModal from './components/MetricModal.jsx';
import SearchBar from './components/SearchBar.jsx';
import WeatherBar from './components/WeatherBar';
import { useWeather } from './hooks/useWeather';
import { useMarine } from './hooks/useMarine';
import { useBeaches } from './hooks/useBeaches';
import { useVessels } from './hooks/useVessels';
import { useSentinelAll } from './hooks/useSentinel';
import { useBuoy } from './hooks/useBuoy';
import { useAI } from './hooks/useAI';
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

const SCORE_CLASS = { green: 'status-good', amber: 'status-moderate', red: 'status-warning' };
const SCORE_LABEL = { green: 'Good', amber: 'Elevated', red: 'High Risk' };

function scoreToValue(score) {
  return score === 'green' ? 85 : score === 'amber' ? 60 : 35;
}

function degToCompass(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function buildSentinelMetrics(sentinel) {
  if (!sentinel?.indicators) return null;
  const { tur, chl, spm } = sentinel.indicators;
  let risk = 0;
  if (tur?.score === 'amber') risk += 0.3;
  if (chl?.score !== 'green') risk += 0.2;

  return {
    risk,
    turbidity: tur ? {
      id: 6, icon: 'turbidity', name: 'Turbidity',
      fullName: 'Water Turbidity',
      value: tur.current_value?.toFixed(2) ?? '—',
      unit: 'NTU',
      status: SCORE_LABEL[tur.score] ?? 'Unknown',
      statusClass: SCORE_CLASS[tur.score] ?? 'status-good',
      prediction: tur.score === 'green' ? 'stable' : 'elevated',
      importance: 'Turbidity measures water clarity. High turbidity blocks sunlight needed for photosynthesis, smothers benthic habitats, and can indicate runoff pollution or algal bloom onset.',
      measurement: 'Derived from Sentinel-2 satellite red-band reflectance ratios and validated against in-situ nephelometric measurements. Values are expressed in Nephelometric Turbidity Units (NTU).',
      idealRange: '< 2 NTU excellent; 2–5 NTU good; 5–10 NTU moderate; > 10 NTU poor visibility',
      currentAnalysis: tur.score === 'green'
        ? 'Water is clear with minimal suspended particles. Light penetration is excellent, supporting healthy photosynthesis and good visibility for swimmers.'
        : 'Elevated turbidity detected, likely from recent wave activity, runoff, or sediment resuspension. Conditions are being monitored.',
    } : null,
    algae: chl ? {
      id: 10, icon: 'phosphorus', name: 'Algae Risk',
      fullName: 'Chlorophyll-a (Algae Risk)',
      value: chl.current_value?.toFixed(2) ?? '—',
      unit: 'mg/m³',
      status: SCORE_LABEL[chl.score] ?? 'Unknown',
      statusClass: SCORE_CLASS[chl.score] ?? 'status-good',
      prediction: chl.score === 'green' ? 'normal bloom' : 'bloom risk',
      importance: 'Chlorophyll-a is a direct indicator of phytoplankton biomass. Elevated concentrations signal algal blooms that deplete oxygen, produce toxins, and can make swimming dangerous.',
      measurement: 'Derived from Sentinel-2 satellite multispectral imagery using band ratios (B4/B3/B2). Values are calibrated against in-situ water samples for accuracy.',
      idealRange: '< 2 mg/m³ normal; 2–10 mg/m³ elevated; > 10 mg/m³ bloom alert',
      currentAnalysis: chl.score === 'green' ? 'Phytoplankton levels are within normal range. No bloom risk detected.' : 'Elevated chlorophyll detected. Monitor for potential bloom development and avoid water contact if values rise further.',
    } : null,
    particles: spm ? {
      id: 11, icon: 'turbidity', name: 'Sediment',
      fullName: 'Suspended Particulate Matter',
      value: spm.current_value?.toFixed(2) ?? '—',
      unit: 'g/m³',
      status: SCORE_LABEL[spm.score] ?? 'Unknown',
      statusClass: SCORE_CLASS[spm.score] ?? 'status-good',
      prediction: 'water clarity',
      importance: 'Suspended sediment reduces light penetration, smothers seagrass and benthic organisms, and carries adsorbed pollutants. High SPM often follows storms, dredging, or coastal erosion.',
      measurement: 'Quantified from Sentinel-2 satellite using the red-edge and NIR bands. Correlates with in-situ gravimetric filter measurements for calibration.',
      idealRange: '< 5 g/m³ clear; 5–25 g/m³ moderate; > 25 g/m³ turbid',
      currentAnalysis: spm.score === 'green' ? 'Sediment load is low. Light penetration is good and benthic habitats are unaffected.' : 'Elevated suspended sediment detected, likely from recent wave activity or runoff. Conditions should clear within 24–48 hours.',
    } : null,
    scoreCard: {
      value: scoreToValue(sentinel.overall_score),
      max: 100,
      status: `${SCORE_LABEL[sentinel.overall_score] ?? 'Good'} Quality`,
    },
  };
}


const BEACH_ORDER_DEFAULT = [6, 5, 8, 10, 4, 1, 7, 12];
const OFFSHORE_ORDER_DEFAULT = [9, 8, 12, 5, 6, 11, 10, 1];

function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

export default function App() {
  const [metrics] = useState(METRICS_DATA);
  const [beachOrder, setBeachOrder] = useState(() => {
    const saved = lsGet('beachOrder', null);
    if (!Array.isArray(saved)) return BEACH_ORDER_DEFAULT;
    const valid = saved.filter(id => BEACH_ORDER_DEFAULT.includes(id));
    return valid.length === BEACH_ORDER_DEFAULT.length ? valid : BEACH_ORDER_DEFAULT;
  });
  const [offshoreOrder, setOffshoreOrder] = useState(() => {
    const saved = lsGet('offshoreOrder', null);
    if (!Array.isArray(saved)) return OFFSHORE_ORDER_DEFAULT;
    const valid = saved.filter(id => OFFSHORE_ORDER_DEFAULT.includes(id));
    return valid.length === OFFSHORE_ORDER_DEFAULT.length ? valid : OFFSHORE_ORDER_DEFAULT;
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
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

  const [selectedBeachId, setSelectedBeachId] = useState(() => lsGet('selectedBeachId', null));
  const [isOffshore, setIsOffshore] = useState(() => lsGet('isOffshore', false));

  useEffect(() => {
    if (beachList.length > 0) {
      const exists = beachList.find(b => b._id === selectedBeachId);
      if (!exists) {
        const id = beachList[0]._id;
        setSelectedBeachId(id);
        lsSet('selectedBeachId', id);
        if (!offshoreByGroup[beachList[0].group]) {
          setIsOffshore(false);
          lsSet('isOffshore', false);
        }
      }
    }
  }, [beachList, selectedBeachId]);

  const selectedBeach = beachList.find(b => b._id === selectedBeachId) || NEARBY_BEACHES[0];
  const offshoreForSelected = offshoreByGroup[selectedBeach?.group];
  const activeLocation = isOffshore && offshoreForSelected ? offshoreForSelected : selectedBeach;

  const activityMode = isOffshore && offshoreForSelected ? 'offshore' : 'beach';
  const weatherData = useWeather(activeLocation.lat, activeLocation.lon);

  const vesselShore = selectedBeach ? { lat: selectedBeach.lat, lng: selectedBeach.lon } : null;
  const vesselOffshore = offshoreForSelected ? { lat: offshoreForSelected.lat, lng: offshoreForSelected.lon } : null;
  const { data: vesselData } = useVessels(vesselShore, vesselOffshore);

  const { map: sentinelAll, loading: sentinelLoading } = useSentinelAll(refreshKey);
  const sentinelMetrics = buildSentinelMetrics(sentinelAll[selectedBeach?._id] ?? null);
  const { data: buoyData, loading: buoyLoading } = useBuoy(selectedBeach?._id ?? null, refreshKey);

  const activeMetrics = useMemo(() => {
    // id legend: 1=Oxygen,3=Nitrogen,4=pH,5=Temp,6=Turbidity,7=Rain,8=Waves,9=Current,10=Algae,11=Sediment,12=Wind
    const BEACH_IDS = new Set([1, 4, 5, 7, 8]);
    const OFFSHORE_IDS = new Set([1, 3, 5, 8, 9]);
    const allowedIds = activityMode === 'beach' ? BEACH_IDS : OFFSHORE_IDS;

    const windCard = buoyData?.wind_speed_ms != null ? {
      id: 12, icon: 'currents', name: 'Wind',
      fullName: 'Wind Speed & Direction',
      value: buoyData.wind_speed_ms.toFixed(1),
      unit: `m/s ${degToCompass(buoyData.wind_direction_deg)}`,
      status: 'Live', statusClass: 'status-good',
      prediction: `${buoyData.wind_direction_deg?.toFixed(0) ?? '—'}°`,
      importance: 'Wind drives surface currents, wave generation, and the transport of sea spray and pollutants. Offshore winds push surface water away from shore, affecting swimming conditions and fish aggregation zones.',
      measurement: 'Measured by anemometer sensors mounted on the coastal buoy at 10 m height. Speed is reported in m/s and direction in degrees from true north.',
      idealRange: '< 5 m/s calm; 5–10 m/s breezy; > 10 m/s strong — caution for water activities',
      currentAnalysis: buoyData.wind_speed_ms < 5 ? 'Wind is calm. Excellent conditions for water activities with minimal wave generation.' : buoyData.wind_speed_ms < 10 ? 'Moderate breeze. Some wave action expected. Exercise caution for small watercraft.' : 'Strong wind conditions. Water activities not recommended. High wave and drift risk.',
    } : null;

    const base = metrics
      .filter(m => allowedIds.has(m.id))
      .map(m => {
        if (m.id === 5) {
          const updated = { ...m };
          if (buoyData?.water_temp_c != null) updated.waterTemp = buoyData.water_temp_c.toFixed(1);
          if (weatherData?.temp != null) updated.value = Math.round(weatherData.temp);
          return updated;
        }
        if (m.id === 8 && buoyData?.wave_height_m != null)
          return { ...m, value: buoyData.wave_height_m.toFixed(2), prediction: buoyData.wave_trend, statusClass: buoyData.wave_state_beaufort <= 3 ? 'status-good' : 'status-moderate' };
        return m;
      });

    const order = activityMode === 'beach' ? beachOrder : offshoreOrder;
    const all = [
      ...base,
      ...(windCard ? [windCard] : []),
      ...[sentinelMetrics?.turbidity, sentinelMetrics?.algae, sentinelMetrics?.particles].filter(Boolean),
    ];
    return order.map(id => all.find(m => m.id === id)).filter(Boolean);
  }, [metrics, activityMode, buoyData, weatherData, sentinelMetrics, beachOrder, offshoreOrder]);

  const isDataReady = !beachesLoading && !sentinelLoading && !buoyLoading && weatherData?.forecast !== 'Loading...';
  const marineData = useMarine(activeMetrics, weatherData, activityMode, isDataReady);


  const { data: aiData, loading: aiLoading } = useAI(activeMetrics, MARINE_LIFE, weatherData, activityMode, isDataReady);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {}, // silently keep Varna default on deny/error
      { timeout: 8000, maximumAge: 300000, enableHighAccuracy: false }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.currentTarget.style.opacity = '0.4';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const ids = activeMetrics.map(m => m.id);
    const [dragged] = ids.splice(draggedIndex, 1);
    ids.splice(dropIndex, 0, dragged);
    if (activityMode === 'beach') {
      setBeachOrder(ids);
      lsSet('beachOrder', ids);
    } else {
      setOffshoreOrder(ids);
      lsSet('offshoreOrder', ids);
    }
    setDraggedIndex(null);
  };


  return (
    <>
      <OceanBackground />
      <div className="gradient-bg" />
      <div
        className="gradient-overlay"
        style={{ opacity: Math.min(scrollY / 500, 0.6) }}
      />
      <BubblesBackground visible={scrollY > 600} />

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
                  onClick={() => { setIsOffshore(false); lsSet('isOffshore', false); setRefreshKey(k => k + 1); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12 A9 9 0 0 1 21 12" />
                    <line x1="12" y1="12" x2="12" y2="19" />
                    <line x1="9" y1="19" x2="15" y2="19" />
                    <path d="M2 20 c2.5-2 5 2 7.5 0 s5-2 7.5 0 s5 2 7.5 0" />
                  </svg>
                  Beach
                </button>
                <button
                  className={`mode-btn ${isOffshore ? 'active' : ''}`}
                  onClick={() => { setIsOffshore(true); lsSet('isOffshore', true); setRefreshKey(k => k + 1); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="3" />
                    <line x1="12" y1="22" x2="12" y2="8" />
                    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                  </svg>
                  Offshore
                </button>
              </div>
            )}
          </div>
        </header>

        <SearchBar
          beaches={beachList}
          onSelect={(id) => {
            const beach = beachList.find(b => b._id === id);
            setSelectedBeachId(id);
            lsSet('selectedBeachId', id);
            if (!beach || !offshoreByGroup[beach.group]) {
              setIsOffshore(false);
              lsSet('isOffshore', false);
            }
          }}
        />

        <Card variant="score" data={sentinelMetrics?.scoreCard ?? SCORE_DATA} />

        <WeatherBar data={weatherData} marineData={marineData} activityMode={activityMode} />

        <div className="desktop-layout">
          <div className="left-column">
            <div className="metrics-grid">
              {(sentinelLoading || buoyLoading)
                ? Array.from({ length: 9 }).map((_, i) => <Card key={`sk-${i}`} variant="skeleton" />)
                : activeMetrics.map((metric, index) => (
                  <Card
                    key={metric.id}
                    variant="metric"
                    data={metric}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => setSelectedMetric(metric)}
                    isDragOver={dragOverIndex === index && draggedIndex !== index}
                  />
                ))
              }
            </div>


          </div>

          <div className="right-column">
            <Card variant="map" data={{ ...LOCATION_DATA, lat: activeLocation.lat, lon: activeLocation.lon, coordinates: `${activeLocation.lat}° N, ${activeLocation.lon}° E`, shipCount: vesselData?.shipCount ?? null, vesselRisk: vesselData?.risk ?? null }} />

            <div>
              <div className="section-title">
                Nearby Beaches
              </div>
              <div className="beaches-grid">
                {beachesError && <div style={{ color: 'red', gridColumn: '1 / -1' }}>Error: {beachesError}</div>}

                {beachesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Card key={`skeleton-${i}`} variant="skeleton" />
                  ))
                ) : (
                  <>
                    {beachList.map((beach) => (
                      <div key={beach._id} onClick={() => {
                        setSelectedBeachId(beach._id);
                        lsSet('selectedBeachId', beach._id);
                        if (!offshoreByGroup[beach.group]) {
                          setIsOffshore(false);
                          lsSet('isOffshore', false);
                        }
                      }} style={{ cursor: 'pointer' }}>
                        <Card variant="beach" data={beach} sentinelScore={sentinelAll[beach._id]?.overall_score ?? null} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>


          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          {aiLoading ? (
            <div className="glass-card card--info" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="info-title">
                {activityMode === 'offshore' ? 'Water Quality' : 'Swimming Conditions & Quality'}
                <span className="ai-badge ai-badge--pulse">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 1l2.09 6.26L20.5 9l-6.41 1.74L12 17l-2.09-6.26L3.5 9l6.41-1.74Z" />
                    <path d="M19 2l.9 2.7L22.6 5.6l-2.7.9L19 9l-.9-2.7L15.4 5.6l2.7-.9Z" opacity="0.6" />
                  </svg>
                  Analyzing with AI...
                </span>
              </div>
              <div className="skeleton-shimmer" style={{ height: '72px', borderRadius: '8px', width: '100%' }} />
            </div>
          ) : (
            <Card
              variant="info"
              data={{
                title: activityMode === 'offshore' ? 'Water Quality' : 'Swimming Conditions & Quality',
                text: aiData?.waterQualitySummary || INFO_DATA.text,
              }}
            />
          )}
        </div>

        <div style={{ marginTop: '24px' }}>
          {activityMode === 'offshore' && (
            marineData?.marineLifeActivity ? (
              <Card variant="marine" data={marineData.marineLifeActivity} locationName={activeLocation.name} />
            ) : (
              <div className="glass-card card--marine" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="info-title">
                  Marine Life Activity
                  <span className="ai-badge ai-badge--pulse">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M12 1l2.09 6.26L20.5 9l-6.41 1.74L12 17l-2.09-6.26L3.5 9l6.41-1.74Z" />
                      <path d="M19 2l.9 2.7L22.6 5.6l-2.7.9L19 9l-.9-2.7L15.4 5.6l2.7-.9Z" opacity="0.6" />
                    </svg>
                    Analyzing with AI...
                  </span>
                </div>
                <div className="skeleton-shimmer" style={{ height: '80px', borderRadius: '8px', width: '100%' }} />
                <div className="skeleton-shimmer" style={{ height: '80px', borderRadius: '8px', width: '100%' }} />
                <div className="skeleton-shimmer" style={{ height: '80px', borderRadius: '8px', width: '100%' }} />
              </div>
            )
          )}
        </div>

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
