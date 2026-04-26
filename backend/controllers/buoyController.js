import MongoDB from '../db.js';

export const getBuoyData = async (req, res) => {
  try {
    const { beachId } = req.params;

    // Get last 2 records for trend calculation
    const docs = await MongoDB.collection('buoy_observations')
      .find({ 'meta.beach_ids': beachId })
      .sort({ timestamp: -1 })
      .limit(2)
      .toArray();

    if (!docs.length) return res.status(404).json({ message: 'No buoy data' });

    const latest = docs[0];
    const prev = docs[1] ?? null;
    const waveTrend = prev
      ? (latest.wave_height_m > prev.wave_height_m ? '↑ increasing' : '→ stable')
      : '→ stable';

    res.status(200).json({
      water_temp_c: latest.water_temp_c,
      wave_height_m: latest.wave_height_m,
      wave_direction_deg: latest.wave_direction_deg,
      wave_state_beaufort: latest.wave_state_beaufort,
      wind_speed_ms: latest.wind_speed_ms,
      wind_direction_deg: latest.wind_direction_deg,
      wave_trend: waveTrend,
      timestamp: latest.timestamp,
    });
  } catch (err) {
    console.error('Buoy error:', err);
    res.status(500).json({ message: 'Error fetching buoy data' });
  }
};
