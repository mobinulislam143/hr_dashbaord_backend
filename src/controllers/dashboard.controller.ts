import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const getMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalApplicants,
    interviewsScheduled,
    interviewsCompleted,
    hiredThisMonth,
    activeReps,
    inactiveReps,
    firedReps,
  ] = await Promise.all([
    prisma.applicant.count({ where: { organizationId: orgId } }),
    prisma.applicant.count({ where: { organizationId: orgId, status: 'INTERVIEW_SCHEDULED' } }),
    prisma.applicant.count({ where: { organizationId: orgId, status: 'INTERVIEW_COMPLETED' } }),
    prisma.applicant.count({
      where: { organizationId: orgId, status: 'HIRED', updatedAt: { gte: startOfMonth } },
    }),
    prisma.applicant.count({ where: { organizationId: orgId, status: 'ACTIVE_REP' } }),
    prisma.applicant.count({ where: { organizationId: orgId, status: 'INACTIVE' } }),
    prisma.applicant.count({ where: { organizationId: orgId, status: 'FIRED' } }),
  ]);

  sendSuccess(res, {
    totalApplicants,
    interviewsScheduled,
    interviewsCompleted,
    hiredThisMonth,
    activeReps,
    inactiveReps,
    firedReps,
  });
};

export const getFunnel = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;

  const statuses = [
    'APPLIED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED',
    'HIRED', 'TRAINING_1_COMPLETE', 'TRAINING_2_COMPLETE',
    'TRAINING_3_COMPLETE', 'ACTIVE_REP',
  ];

  const counts = await Promise.all(
    statuses.map(status =>
      prisma.applicant.count({ where: { organizationId: orgId, status: status as any } })
    )
  );

  const funnel = [
    { stage: 'Applications', count: counts[0] },
    { stage: 'Interview Scheduled', count: counts[1] },
    { stage: 'Interview Completed', count: counts[2] },
    { stage: 'Hired', count: counts[3] },
    { stage: 'Training 1', count: counts[4] },
    { stage: 'Training 2', count: counts[5] },
    { stage: 'Training 3', count: counts[6] },
    { stage: 'Active Rep', count: counts[7] },
  ];

  sendSuccess(res, funnel);
};

export const getRepsByBusiness = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;

  const businesses = ['VEXON', 'EASYSCALE', 'TELENZA', 'SOLV_GLOBAL', 'CTC_COURTS'];

  const counts = await Promise.all(
    businesses.map(business =>
      prisma.applicant.count({
        where: { organizationId: orgId, business: business as any, status: 'ACTIVE_REP' },
      })
    )
  );

  const result = businesses.map((b, i) => ({
    business: b,
    label: b.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    count: counts[i],
  }));

  sendSuccess(res, result);
};
