export const NEARBY_BEACHES = [
  { id: 1, name: 'Asparuhovo Beach', distance: '2.3 km', score: 82, status: 'Excellent', lat: 43.1812, lon: 27.9100 },
  { id: 2, name: 'Sea Garden Beach', distance: '4.1 km', score: 78, status: 'Good', lat: 43.2081, lon: 27.9287 },
  { id: 3, name: 'Kabakum Beach', distance: '8.7 km', score: 85, status: 'Excellent', lat: 43.2628, lon: 28.0267 },
  { id: 4, name: 'Golden Sands', distance: '18.2 km', score: 71, status: 'Good', lat: 43.2846, lon: 28.0435 },
];

export const MARINE_LIFE = [
  {
    id: 1,
    species: 'European Sprat',
    scientificName: 'Sprattus sprattus',
    activity: 'High',
    activityClass: 'status-good',
    reason: 'Peak feeding time - active in upper water layers during twilight hours',
    seasonalNote: 'April spawning season - large schools present',
  },
  {
    id: 2,
    species: 'Turbot',
    scientificName: 'Scophthalmus maximus',
    activity: 'Moderate',
    activityClass: 'status-moderate',
    reason: 'Bottom feeding activity - temperature optimal for hunting',
    seasonalNote: 'Pre-spawning aggregation begins late April',
  },
  {
    id: 3,
    species: 'Black Sea Horse Mackerel',
    scientificName: 'Trachurus mediterraneus',
    activity: 'High',
    activityClass: 'status-good',
    reason: 'Evening hunting period - chasing sprat schools near surface',
    seasonalNote: 'Migration patterns peak in April',
  },
  {
    id: 4,
    species: 'Common Dolphin',
    scientificName: 'Delphinus delphis',
    activity: 'Low',
    activityClass: 'status-warning',
    reason: 'Nocturnal rest period approaching',
    seasonalNote: 'Calving season - mothers with calves present',
  },
];

export const SCORE_DATA = {
  value: 75,
  max: 100,
  status: 'Good Quality',
};

export const LOCATION_DATA = {
  name: 'Black Sea, Varna',
  coordinates: '43.2141° N, 27.9147° E',
  stationLabel: 'Monitoring Station',
};

export const INFO_DATA = {
  title: 'Water Quality Summary',
  text: 'The current water quality is in good condition. Dissolved oxygen levels are optimal for marine life, nutrient concentrations are within acceptable ranges, and pH is well-balanced. Continue monitoring for any changes.',
};

export const METRICS_DATA = [
  {
    id: 1,
    icon: 'oxygen',
    name: 'Oxygen',
    value: '8.2',
    unit: 'mg/L',
    status: 'Optimal',
    statusClass: 'status-good',
    fullName: 'Dissolved Oxygen',
    importance:
      'Dissolved oxygen is critical for aquatic life. Fish and other organisms need oxygen to survive. Low oxygen levels can lead to fish kills and ecosystem collapse.',
    measurement:
      'Measured using optical or electrochemical sensors that detect oxygen molecules in water. Sensors are deployed at various depths to capture vertical oxygen profiles.',
    idealRange: '6–8 mg/L for most marine life',
    currentAnalysis:
      'Current levels are optimal, supporting healthy marine ecosystems and biodiversity.',
    prediction: 'stable',
  },
  {
    id: 2,
    icon: 'phosphorus',
    name: 'Phosphorus',
    value: '0.03',
    unit: 'mg/L',
    status: 'Low',
    statusClass: 'status-good',
    fullName: 'Total Phosphorus',
    importance:
      'Phosphorus is a key nutrient but excessive amounts cause algal blooms and eutrophication. This depletes oxygen and creates dead zones harmful to marine life.',
    measurement:
      'Water samples are collected and analyzed using spectrophotometry in laboratory conditions. Automated sensors can also provide real-time monitoring.',
    idealRange: 'Below 0.05 mg/L for pristine waters',
    currentAnalysis:
      'Levels are low and healthy, indicating minimal agricultural runoff and good water quality.',
    prediction: 'decreasing',
  },
  {
    id: 3,
    icon: 'nitrogen',
    name: 'Nitrogen',
    value: '1.8',
    unit: 'mg/L',
    status: 'Moderate',
    statusClass: 'status-moderate',
    fullName: 'Total Nitrogen',
    importance:
      'Like phosphorus, nitrogen is essential for life but excess amounts fuel harmful algal blooms. Sources include agricultural fertilizers, sewage, and atmospheric deposition.',
    measurement:
      'Collected samples undergo chemical analysis using methods like Kjeldahl digestion or ion chromatography to measure different nitrogen forms.',
    idealRange: 'Below 1.5 mg/L for coastal waters',
    currentAnalysis:
      'Slightly elevated but within acceptable range. Monitoring recommended to prevent further increases.',
    prediction: 'stable',
  },
  {
    id: 4,
    icon: 'ph',
    name: 'pH Level',
    value: '7.6',
    unit: 'scale',
    status: 'Balanced',
    statusClass: 'status-good',
    fullName: 'pH (Acidity/Alkalinity)',
    importance:
      'pH measures water acidity or alkalinity. Most marine life thrives in a narrow pH range. Ocean acidification from CO₂ absorption threatens shellfish and coral reefs.',
    measurement:
      'Measured using glass electrode pH sensors or colorimetric methods. Continuous monitoring systems provide real-time pH data.',
    idealRange: '7.5–8.4 for seawater',
    currentAnalysis: 'pH is well-balanced and suitable for diverse marine ecosystems.',
    prediction: 'optimal',
  },
  {
    id: 5,
    icon: 'temperature',
    name: 'Temperature',
    value: '—',
    unit: '°C',
    status: 'Updating',
    statusClass: 'status-moderate',
    fullName: 'Water Temperature',
    importance:
      'Temperature affects oxygen solubility, metabolic rates, and species distribution. Rising temperatures due to climate change stress marine ecosystems.',
    measurement:
      'Thermistor or thermocouple sensors measure temperature at different depths. Satellite thermal imaging also tracks surface temperature patterns.',
    idealRange: '15–22°C for temperate marine waters',
    currentAnalysis: 'Temperature is within normal seasonal range for this region.',
    prediction: 'warming trend',
  },
  {
    id: 6,
    icon: 'turbidity',
    name: 'Turbidity',
    value: '2.1',
    unit: 'NTU',
    status: 'Clear',
    statusClass: 'status-good',
    fullName: 'Water Turbidity',
    importance:
      'Turbidity measures water clarity. High turbidity blocks sunlight needed for photosynthesis, smothers benthic habitats, and indicates pollution or erosion.',
    measurement:
      'Optical sensors measure light scattering caused by suspended particles. Nephelometric turbidity units (NTU) quantify cloudiness.',
    idealRange: 'Below 5 NTU for clear coastal waters',
    currentAnalysis:
      'Water is clear with minimal suspended sediment, allowing good light penetration.',
    prediction: 'stable next hours',
  },
  {
    id: 7,
    icon: 'rainfall',
    name: 'Rainfall',
    fullName: 'Precipitation',
    value: '0',
    unit: 'mm',
    status: 'Normal',
    statusClass: 'status-good',
    prediction: 'no rain expected',
    importance: 'Heavy rainfall washes pollutants, nutrients, and sediment into coastal waters, rapidly degrading water quality and increasing the risk of bacterial contamination and algal blooms.',
    measurement: 'Rain gauge sensors at coastal weather stations record hourly precipitation totals. Data is cross-referenced with OpenWeather satellite and radar estimates for real-time accuracy.',
    idealRange: '0 mm for swimming conditions; > 10 mm/h triggers elevated contamination alerts',
    currentAnalysis: 'No precipitation recorded. Water quality impact from runoff is minimal and conditions are stable.',
  },
  {
    id: 8,
    icon: 'waves',
    name: 'Waves',
    fullName: 'Wave Height',
    value: '—',
    unit: 'm',
    status: 'Updating',
    statusClass: 'status-moderate',
    prediction: 'increasing ↑',
    importance: 'Wave height determines swimming safety and sediment resuspension. High waves stir up the seabed, reduce visibility, and create dangerous currents that can sweep swimmers offshore.',
    measurement: 'Acoustic Doppler buoys measure surface displacement to calculate significant wave height (Hs). Beaufort scale classification is derived from wind speed correlation.',
    idealRange: '< 0.5 m calm; 0.5–1.2 m moderate; > 1.5 m unsafe for swimming',
    currentAnalysis: 'Live buoy data is being processed. Wave state will be updated shortly.',
  },
  {
    id: 9,
    icon: 'currents',
    name: 'Current',
    fullName: 'Sea Current',
    value: '0.8',
    unit: 'm/s NE',
    status: 'Normal',
    statusClass: 'status-good',
    prediction: 'shifting north',
    importance: 'Sea currents transport nutrients, larvae, and pollutants across large distances. Strong currents affect navigation safety and the dispersal of any contaminants released near the coast.',
    measurement: 'Acoustic Doppler Current Profilers (ADCP) on offshore buoys measure water velocity at multiple depths. Direction and speed are reported in real-time.',
    idealRange: '< 0.5 m/s safe for swimming; 0.5–1.5 m/s manageable for vessels; > 2 m/s caution',
    currentAnalysis: 'Current speed is within normal range for this region. Northeast drift is typical for this season and poses no hazard to marine operations.',
  },
];
