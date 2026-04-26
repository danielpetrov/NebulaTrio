import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const VESSEL_API_URL = 'https://api.vesselapi.com/v1/location/vessels/radius';
const RADIUS_M = 1500; // 2km

async function fetchVessels(lat, lng) {
  const apiKey = process.env.VESSELS_API_KEY;
  if (!apiKey) throw new Error('VESSELS_API_KEY not configured');

  const url = new URL(VESSEL_API_URL);
  url.searchParams.set('filter.latitude', lat);
  url.searchParams.set('filter.longitude', lng);
  url.searchParams.set('filter.radius', RADIUS_M);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Vessel API error: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeVessels(raw, centerLat, centerLng) {
  const items = Array.isArray(raw?.vessels ?? raw?.data ?? raw) ? (raw?.vessels ?? raw?.data ?? raw) : [];
  return items
    .map(v => {
      const lat = v.latitude ?? v.lat;
      const lng = v.longitude ?? v.lon ?? v.lng;
      return {
        name: v.vessel_name ?? v.name ?? 'Unknown',
        lat,
        lng,
        sog: v.sog ?? v.speed ?? 0,
        course: v.cog ?? v.course ?? 0,
        nav_status: v.nav_status ?? -1,
        mmsi: v.mmsi,
      };
    })
    .filter(ship => ship.nav_status === 0 && ship.lat && ship.lng)
    .slice(0, 10);
}

export const detectVessels = async (req, res) => {
  const { shore, offshore } = req.body;

  if (!shore?.lat || !shore?.lng) {
    return res.status(400).json({ message: 'shore coordinates required' });
  }

  const lat = offshore?.lat ?? shore.lat;
  const lng = offshore?.lng ?? shore.lng;

  try {
    const raw = await fetchVessels(lat, lng);
    const ships = normalizeVessels(raw);

    const shipCount = ships.length;

    return res.json({
      shipCount,
      ships,
      risk: shipCount > 0 ? 'ship_activity' : 'clear',
      center: { lat, lng },
      timestamp: new Date(),
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ message: 'Vessel API timeout', ships: [], shipCount: 0, risk: 'clear' });
    }
    console.error('Vessel API error:', err.message);
    return res.status(502).json({ message: err.message, ships: [], shipCount: 0, risk: 'clear' });
  }
};
