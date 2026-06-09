import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

const verifyApplicantOwnership = async (applicantId: string, orgId: string) => {
  return prisma.applicant.findFirst({ where: { id: applicantId, organizationId: orgId } });
};

export const getInterview = async (req: AuthRequest, res: Response): Promise<void> => {
  const { applicantId } = req.params;
  const owned = await verifyApplicantOwnership(applicantId, req.user!.organizationId);
  if (!owned) { sendError(res, 'Not found', 404); return; }

  const interview = await prisma.interview.findUnique({ where: { applicantId } });
  sendSuccess(res, interview);
};

export const upsertInterview = async (req: AuthRequest, res: Response): Promise<void> => {
  const { applicantId } = req.params;
  const owned = await verifyApplicantOwnership(applicantId, req.user!.organizationId);
  if (!owned) { sendError(res, 'Not found', 404); return; }

  const { interviewDate, notes, score } = req.body;

  const interview = await prisma.interview.upsert({
    where: { applicantId },
    update: {
      interviewDate: interviewDate ? new Date(interviewDate) : undefined,
      notes,
      score: score ? parseInt(score) : undefined,
    },
    create: {
      applicantId,
      interviewDate: interviewDate ? new Date(interviewDate) : undefined,
      notes,
      score: score ? parseInt(score) : undefined,
    },
  });

  sendSuccess(res, interview, 'Interview saved');
};
