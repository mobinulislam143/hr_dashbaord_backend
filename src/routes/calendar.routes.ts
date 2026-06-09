import { Router } from 'express';
import { getCalendarEvents } from '../controllers/calendar.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/events', authenticate, getCalendarEvents);

export default router;
