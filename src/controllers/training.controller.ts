import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

const verifyApplicantOwnership = async (applicantId: string, orgId: string) => {
  return prisma.applicant.findFirst({ where: { id: applicantId, organizationId: orgId } });
};

export const getTrainings = async (req: AuthRequest, res: Response): Promise<void> => {
  const { applicantId } = req.params;
  const owned = await verifyApplicantOwnership(applicantId, req.user!.organizationId);
  if (!owned) { sendError(res, 'Not found', 404); return; }

  const trainings = await prisma.training.findMany({
    where: { applicantId },
    orderBy: { trainingNumber: 'asc' },
  });

  sendSuccess(res, trainings);
};

export const upsertTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  const { applicantId } = req.params;
  const { trainingNumber, scheduledDate, completedDate, result } = req.body;

  const owned = await verifyApplicantOwnership(applicantId, req.user!.organizationId);
  if (!owned) { sendError(res, 'Not found', 404); return; }

  const num = parseInt(trainingNumber);
  if (![1, 2, 3].includes(num)) {
    sendError(res, 'Training number must be 1, 2, or 3'); return;
  }

  const training = await prisma.training.upsert({
    where: { applicantId_trainingNumber: { applicantId, trainingNumber: num } },
    update: {
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      completedDate: completedDate ? new Date(completedDate) : undefined,
      result: result || undefined,
    },
    create: {
      applicantId,
      trainingNumber: num,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      completedDate: completedDate ? new Date(completedDate) : undefined,
      result: result || undefined,
    },
  });

  sendSuccess(res, training, 'Training saved');
};
