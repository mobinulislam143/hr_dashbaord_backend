import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const createRep = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;
  const { fullName, phone, email, city, state, business, role, recruitingSource, hireDate } = req.body;

  if (!fullName || !business || !role) {
    sendError(res, 'fullName, business, and role are required'); return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const applicant = await tx.applicant.create({
      data: {
        organizationId: orgId,
        fullName,
        phone: phone || '',
        email: email || '',
        city: city || '',
        state: state || '',
        business,
        role,
        recruitingSource: recruitingSource || 'OTHER',
        status: 'ACTIVE_REP',
        dateApplied: new Date(),
      },
    });

    const rep = await tx.activeRep.create({
      data: {
        applicantId: applicant.id,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        isActive: true,
      },
      include: {
        applicant: true,
        scores: [],
        performance: [],
      } as any,
    });

    return rep;
  });

  sendSuccess(res, result, 'Rep added successfully');
};

const computeTier = (avg: number): 'A_PLAYER' | 'B_PLAYER' | 'C_PLAYER' => {
  if (avg >= 8) return 'A_PLAYER';
  if (avg >= 5) return 'B_PLAYER';
  return 'C_PLAYER';
};

export const getReps = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;
  const { business, tier, managerId, page = '1', limit = '20' } = req.query;

  const where: any = { applicant: { organizationId: orgId } };
  if (business) where.applicant = { ...where.applicant, business };
  if (managerId) where.managerId = managerId;

  const [reps, total] = await Promise.all([
    prisma.activeRep.findMany({
      where,
      include: {
        applicant: true,
        manager: { omit: { passwordHash: true } },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
        performance: { orderBy: { weekOf: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
    }),
    prisma.activeRep.count({ where }),
  ]);

  // Apply tier filter in memory (computed field)
  const filtered = tier
    ? reps.filter((r: any) => {
        if (!r.scores[0]) return false;
        const avg = (r.scores[0].workEthic + r.scores[0].coachability + r.scores[0].communication + r.scores[0].consistency + r.scores[0].overallRating) / 5;
        return computeTier(avg) === tier;
      })
    : reps;

  sendSuccess(res, {
    reps: filtered,
    pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total },
  });
};

export const getRep = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;

  const rep = await prisma.activeRep.findFirst({
    where: { id, applicant: { organizationId: orgId } },
    include: {
      applicant: true,
      manager: { omit: { passwordHash: true } },
      scores: { orderBy: { scoredAt: 'desc' } },
      performance: { orderBy: { weekOf: 'desc' } },
      removalLog: true,
    },
  });

  if (!rep) { sendError(res, 'Rep not found', 404); return; }
  sendSuccess(res, rep);
};

export const scoreRep = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;
  const { workEthic, coachability, communication, consistency, overallRating } = req.body;

  if (overallRating === undefined || overallRating === null) {
    sendError(res, 'Overall Rating is required'); return;
  }

  const rep = await prisma.activeRep.findFirst({
    where: { id, applicant: { organizationId: orgId } },
  });
  if (!rep) { sendError(res, 'Rep not found', 404); return; }

  // Build array of scores that were actually provided
  const providedScores = [overallRating, workEthic, coachability, communication, consistency]
    .filter(v => v !== undefined && v !== null && v > 0);
  const avg  = providedScores.reduce((a, b) => a + b, 0) / providedScores.length;
  const tier = computeTier(avg);

  const score = await prisma.repScore.create({
    data: {
      repId: id,
      workEthic:    workEthic    ?? 0,
      coachability: coachability ?? 0,
      communication:communication ?? 0,
      consistency:  consistency  ?? 0,
      overallRating,
      tier,
      scoredById: req.user!.userId,
    },
  });

  sendSuccess(res, score, 'Score saved');
};

export const addPerformance = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;
  const { weekOf, callsThisWeek, meetingsBooked, revenueThisMonth } = req.body;

  const rep = await prisma.activeRep.findFirst({
    where: { id, applicant: { organizationId: orgId } },
  });
  if (!rep) { sendError(res, 'Rep not found', 404); return; }

  const entry = await prisma.performanceEntry.create({
    data: {
      repId: id,
      weekOf: new Date(weekOf),
      callsThisWeek: parseInt(callsThisWeek) || 0,
      meetingsBooked: parseInt(meetingsBooked) || 0,
      revenueThisMonth: parseFloat(revenueThisMonth) || 0,
    },
  });

  sendSuccess(res, entry, 'Performance logged');
};

export const removeRep = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;
  const { reason, notes, newStatus } = req.body;

  const rep = await prisma.activeRep.findFirst({
    where: { id, applicant: { organizationId: orgId } },
  });
  if (!rep) { sendError(res, 'Rep not found', 404); return; }

  await prisma.$transaction([
    prisma.activeRep.update({ where: { id }, data: { isActive: false } }),
    prisma.applicant.update({
      where: { id: rep.applicantId },
      data: { status: newStatus || 'FIRED' },
    }),
    prisma.removalLog.upsert({
      where: { applicantId: rep.applicantId },
      update: { reason, notes, dateRemoved: new Date() },
      create: { applicantId: rep.applicantId, repId: id, reason, notes },
    }),
  ]);

  sendSuccess(res, null, 'Rep removed');
};

export const updateRepManager = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { managerId } = req.body;
  const orgId = req.user!.organizationId;

  const rep = await prisma.activeRep.findFirst({
    where: { id, applicant: { organizationId: orgId } },
  });
  if (!rep) { sendError(res, 'Rep not found', 404); return; }

  const updated = await prisma.activeRep.update({
    where: { id },
    data: { managerId: managerId || null },
  });

  sendSuccess(res, updated, 'Manager assigned');
};
