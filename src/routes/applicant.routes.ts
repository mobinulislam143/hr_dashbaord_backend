import { Router } from 'express';
import { getApplicants, getApplicant, createApplicant, updateApplicant, updateStatus, deleteApplicant } from '../controllers/applicant.controller';
import { upsertInterview, getInterview } from '../controllers/interview.controller';
import { getTrainings, upsertTraining } from '../controllers/training.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getApplicants);
router.post('/', createApplicant);
router.get('/:id', getApplicant);
router.patch('/:id', updateApplicant);
router.patch('/:id/status', requireRole('ADMIN', 'SUPER_ADMIN'), updateStatus);
router.delete('/:id', deleteApplicant);

// Interview
router.get('/:applicantId/interview', getInterview);
router.put('/:applicantId/interview', upsertInterview);

// Trainings
router.get('/:applicantId/trainings', getTrainings);
router.put('/:applicantId/trainings', upsertTraining);

export default router;
