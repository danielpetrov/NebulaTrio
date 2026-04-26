import MongoDB from '../db.js';

export const getSentinelObservation = async (req, res) => {
  try {
    const { beachId } = req.params;
    const doc = await MongoDB.collection('sentinel2_msi_observations')
      .findOne({ beach_id: beachId }, { sort: { observation_date: -1 } });
    if (!doc) return res.status(404).json({ message: 'No data for this beach' });
    res.status(200).json(doc);
  } catch (err) {
    console.error('Sentinel error:', err);
    res.status(500).json({ message: 'Error fetching sentinel data' });
  }
};

// Latest observation per beach (one per beach_id)
export const getAllSentinelObservations = async (req, res) => {
  try {
    const docs = await MongoDB.collection('sentinel2_msi_observations')
      .aggregate([
        { $sort: { observation_date: -1 } },
        { $group: { _id: '$beach_id', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ])
      .toArray();
    res.status(200).json(docs);
  } catch (err) {
    console.error('Sentinel all error:', err);
    res.status(500).json({ message: 'Error fetching sentinel data' });
  }
};
