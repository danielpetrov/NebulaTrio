import express from 'express';
import { getMeasurements } from '../controllers/dataController.js';
import { createReport, getReports } from '../controllers/reportController.js';
import { getBeaches } from '../controllers/beachController.js';
import { detectVessels } from '../controllers/vesselController.js';

const router = express.Router();

router.get('/data', getMeasurements);
router.post('/report', createReport);
router.get('/reports', getReports);
router.get('/beaches', getBeaches);
router.post('/vessels-nearby', detectVessels);

export default router;
