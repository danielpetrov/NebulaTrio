import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded if this file is imported early
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

let database = null;
let client = null;

const getDatabase = () => {
  if (!database) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
    });
    
    database = client.db('aware');
  }
  return database;
};

// Proxy that lazily initialises the database connection
const MongoDB = new Proxy({}, {
  get(_target, prop) {
    const db = getDatabase();
    const value = db[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});

export default MongoDB;
