import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true
  },
  coordinates: {
    type: [Number], // [lat, lon]
    required: true
  }
});

const beachSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  group: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['beach', 'offshore'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  coordinates: {
    type: pointSchema,
    required: true
  },
  meta: {
    label: String,
    buoy: String
  }
}, { _id: false }); // Disable auto _id since we provide our own string _id

const Beach = mongoose.model('Beach', beachSchema, 'beaches');

export default Beach;
