import mongoose from 'mongoose';

const measurementSchema = new mongoose.Schema({
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  value: { type: Number, required: true },
  type: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Measurement', measurementSchema);
