import { Router } from 'express';
import { getReps, getRep, scoreRep, addPerformance, removeRep, updateRepManager } from '../controllers/rep.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getReps);
router.get('/:id', getRep);
router.post('/:id/score', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), scoreRep);
router.post('/:id/performance', addPerformance);
router.post('/:id/remove', requireRole('ADMIN', 'SUPER_ADMIN'), removeRep);
router.patch('/:id/manager', requireRole('ADMIN', 'SUPER_ADMIN'), updateRepManager);

export default router;
