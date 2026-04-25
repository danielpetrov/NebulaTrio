import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import serverless from 'serverless-http';
import apiRoutes from './routes/api.js';

// Load env from parent directory
dotenv.config({ path: '../.env' });

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;


app.use('/api', apiRoutes);

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Netlify serverless functions
export const handler = serverless(app);
