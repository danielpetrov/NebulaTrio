import Measurement from '../models/Measurement.js';

export const getMeasurements = async (req, res) => {
  try {
    const data = await Measurement.find().sort({ timestamp: -1 }).limit(100);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching measurements' });
  }
};
