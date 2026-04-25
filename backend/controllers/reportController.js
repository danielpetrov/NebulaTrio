import MongoDB from '../db.js';

export const createReport = async (req, res) => {
  try {
    const { location, type, description } = req.body;
    
    if (!location || !location.lat || !location.lng || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const report = { location, type, description, timestamp: new Date() };
    await MongoDB.collection('reports').insertOne(report);
    res.status(201).json({ message: 'Report created successfully', report });
  } catch (error) {
    res.status(500).json({ error: 'Server error creating report' });
  }
};

export const getReports = async (req, res) => {
  try {
    const data = await MongoDB.collection('reports').find().sort({ timestamp: -1 }).limit(100).toArray();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching reports' });
  }
};
