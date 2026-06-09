import { Router } from 'express';
import { getMetrics, getFunnel, getRepsByBusiness } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/metrics', authenticate, getMetrics);
router.get('/funnel', authenticate, getFunnel);
router.get('/businesses', authenticate, getRepsByBusiness);

export default router;
