import MongoDB from '../db.js';

export const getBeaches = async (req, res) => {
  try {
    const beaches = await MongoDB.collection('beaches').find({}).toArray();
    res.status(200).json(beaches);
  } catch (error) {
    console.error('Error fetching beaches:', error);
    res.status(500).json({ message: 'Error fetching beaches' });
  }
};
