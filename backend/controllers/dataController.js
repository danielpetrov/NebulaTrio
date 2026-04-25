import MongoDB from '../db.js';

export const getMeasurements = async (req, res) => {
  try {
    const data = await MongoDB.collection('measurements').find().sort({ timestamp: -1 }).limit(100).toArray();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching measurements' });
  }
};
