import { Router } from 'express';
import { getEmailConfig, saveEmailConfig, sendTestEmail } from '../controllers/email.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/',           authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), getEmailConfig);
router.post('/',          authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), saveEmailConfig);
router.post('/test-send', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), sendTestEmail);

export default router;
