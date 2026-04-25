import Report from '../models/Report.js';

export const createReport = async (req, res) => {
  try {
    const { location, type, description } = req.body;
    
    if (!location || !location.lat || !location.lng || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const report = new Report({ location, type, description });
    await report.save();
    res.status(201).json({ message: 'Report created successfully', report });
  } catch (error) {
    res.status(500).json({ error: 'Server error creating report' });
  }
};

export const getReports = async (req, res) => {
  try {
    const data = await Report.find().sort({ timestamp: -1 }).limit(100);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching reports' });
  }
};
