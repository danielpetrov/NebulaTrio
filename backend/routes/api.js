import express from 'express';
import { getMeasurements } from '../controllers/dataController.js';
import { createReport, getReports } from '../controllers/reportController.js';
import { getBeaches } from '../controllers/beachController.js';
import { detectVessels } from '../controllers/vesselController.js';
import { getSentinelObservation, getAllSentinelObservations } from '../controllers/sentinelController.js';
import { getBuoyData } from '../controllers/buoyController.js';
import { getMarineSummary, getBeachSummary } from '../controllers/aiController.js';
import { getMarineActivity } from '../controllers/marineController.js';

const router = express.Router();

router.get('/data', getMeasurements);
router.post('/report', createReport);
router.get('/reports', getReports);
router.get('/beaches', getBeaches);
router.post('/vessels-nearby', detectVessels);
router.get('/sentinel', getAllSentinelObservations);
router.get('/buoy/:beachId', getBuoyData);
router.get('/sentinel/:beachId', getSentinelObservation);
router.post('/ai/summary/marine', getMarineSummary);
router.post('/ai/summary/beach', getBeachSummary);

// Marine Route
router.post('/marine/activity', getMarineActivity);

export default router;
