import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const getApplicants = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;
  const { business, role, status, source, from, to, search, page = '1', limit = '20' } = req.query;

  const where: any = { organizationId: orgId };
  if (business) where.business = business;
  if (role) where.role = role;
  if (status) where.status = status;
  if (source) where.recruitingSource = source;
  if (from || to) {
    where.dateApplied = {};
    if (from) where.dateApplied.gte = new Date(from as string);
    if (to) where.dateApplied.lte = new Date(to as string);
  }
  if (search) {
    where.OR = [
      { fullName: { contains: search as string, mode: 'insensitive' } },
      { email: { contains: search as string, mode: 'insensitive' } },
      { phone: { contains: search as string } },
    ];
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [applicants, total] = await Promise.all([
    prisma.applicant.findMany({
      where,
      include: { interview: true, trainings: { orderBy: { trainingNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.applicant.count({ where }),
  ]);

  sendSuccess(res, {
    applicants,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
};

export const getApplicant = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;

  const applicant = await prisma.applicant.findFirst({
    where: { id, organizationId: orgId },
    include: {
      interview: true,
      trainings: { orderBy: { trainingNumber: 'asc' } },
      activeRep: { include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 }, manager: { omit: { passwordHash: true } } } },
      removalLog: true,
    },
  });

  if (!applicant) {
    sendError(res, 'Applicant not found', 404);
    return;
  }

  sendSuccess(res, applicant);
};

export const createApplicant = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;
  const { fullName, phone, email, city, state, recruitingSource, business, role, dateApplied } = req.body;

  const applicant = await prisma.applicant.create({
    data: {
      organizationId: orgId,
      fullName, phone, email, city, state,
      recruitingSource, business, role,
      dateApplied: dateApplied ? new Date(dateApplied) : undefined,
    },
  });

  sendSuccess(res, applicant, 'Applicant created', 201);
};

export const updateApplicant = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;

  const existing = await prisma.applicant.findFirst({ where: { id, organizationId: orgId } });
  if (!existing) {
    sendError(res, 'Applicant not found', 404);
    return;
  }

  const { fullName, phone, email, city, state, recruitingSource, business, role } = req.body;

  const applicant = await prisma.applicant.update({
    where: { id },
    data: { fullName, phone, email, city, state, recruitingSource, business, role },
  });

  sendSuccess(res, applicant, 'Applicant updated');
};

export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const orgId = req.user!.organizationId;

  const existing = await prisma.applicant.findFirst({ where: { id, organizationId: orgId } });
  if (!existing) {
    sendError(res, 'Applicant not found', 404);
    return;
  }

  const applicant = await prisma.applicant.update({
    where: { id },
    data: { status },
  });

  // Auto-promote to active rep when status becomes ACTIVE_REP
  if (status === 'ACTIVE_REP') {
    const exists = await prisma.activeRep.findUnique({ where: { applicantId: id } });
    if (!exists) {
      await prisma.activeRep.create({ data: { applicantId: id, hireDate: new Date() } });
    }
  }

  sendSuccess(res, applicant, 'Status updated');
};

export const deleteApplicant = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.user!.organizationId;

  const existing = await prisma.applicant.findFirst({ where: { id, organizationId: orgId } });
  if (!existing) {
    sendError(res, 'Applicant not found', 404);
    return;
  }

  await prisma.applicant.delete({ where: { id } });
  sendSuccess(res, null, 'Applicant deleted');
};
