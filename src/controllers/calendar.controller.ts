import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const getCalendarEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;
  const { from, to } = req.query;

  const dateFilter: any = {};
  if (from) dateFilter.gte = new Date(from as string);
  if (to) dateFilter.lte = new Date(to as string);

  const [interviews, trainings] = await Promise.all([
    prisma.interview.findMany({
      where: {
        applicant: { organizationId: orgId },
        interviewDate: Object.keys(dateFilter).length ? dateFilter : { not: null },
      },
      include: { applicant: { select: { fullName: true, business: true, role: true } } },
    }),
    prisma.training.findMany({
      where: {
        applicant: { organizationId: orgId },
        scheduledDate: Object.keys(dateFilter).length ? dateFilter : { not: null },
      },
      include: { applicant: { select: { fullName: true, business: true } } },
    }),
  ]);

  const events = [
    ...interviews
      .filter((i: any) => i.interviewDate)
      .map((i: any) => ({
        id: `interview-${i.id}`,
        type: 'interview' as const,
        title: `Interview: ${i.applicant.fullName}`,
        date: i.interviewDate,
        business: i.applicant.business,
        role: i.applicant.role,
        applicantId: i.applicantId,
      })),
    ...trainings
      .filter((t: any) => t.scheduledDate)
      .map((t: any) => ({
        id: `training-${t.id}`,
        type: `training_${t.trainingNumber}` as const,
        title: `Training ${t.trainingNumber}: ${t.applicant.fullName}`,
        date: t.scheduledDate,
        business: t.applicant.business,
        applicantId: t.applicantId,
      })),
  ].sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

  sendSuccess(res, events);
};
