import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendWelcomeEmail } from './email.controller';

// ─── Register (create org + admin) ───────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  const { orgName, firstName, lastName, email, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { sendError(res, 'Email already registered', 409); return; }

  const slug = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
  const passwordHash = await bcrypt.hash(password, 12);

  const org  = await prisma.organization.create({ data: { name: orgName, slug } });
  const user = await prisma.user.create({
    data: { email, passwordHash, firstName, lastName, role: 'ADMIN', organizationId: org.id },
  });

  const token = signToken({ userId: user.id, organizationId: org.id, role: user.role });
  sendSuccess(res, {
    token,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    organization: { id: org.id, name: org.name, slug: org.slug },
  }, 'Organization created successfully', 201);
};

// ─── Login ────────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });

  if (!user || !user.isActive) { sendError(res, 'Invalid credentials', 401); return; }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) { sendError(res, 'Invalid credentials', 401); return; }

  const token = signToken({ userId: user.id, organizationId: user.organizationId, role: user.role });
  sendSuccess(res, {
    token,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan },
  }, 'Login successful');
};

// ─── Get current user ─────────────────────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { organization: true },
    omit: { passwordHash: true },
  });
  if (!user) { sendError(res, 'User not found', 404); return; }
  sendSuccess(res, user);
};

// ─── Invite / create team member ─────────────────────────────────────────────
export const inviteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, firstName, lastName, role, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { sendError(res, 'Email already registered', 409); return; }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, firstName, lastName, role: role || 'VIEWER', organizationId: req.user!.organizationId },
  });

  // Send welcome email (non-blocking — don't fail if email fails)
  const org = await prisma.organization.findUnique({ where: { id: req.user!.organizationId } });
  if (org) {
    sendWelcomeEmail(
      org.id, user.firstName, org.name, user.email, password,
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ).catch(() => {}); // fire and forget
  }

  sendSuccess(res, {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role,
  }, 'User added successfully', 201);
};

// ─── Get team members ─────────────────────────────────────────────────────────
export const getTeamMembers = async (req: AuthRequest, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.user!.organizationId },
    omit: { passwordHash: true },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, users);
};

// ─── Update user role ─────────────────────────────────────────────────────────
export const updateUserRole = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { role } = req.body;

  if (id === req.user!.userId) { sendError(res, 'Cannot change your own role', 400); return; }

  const target = await prisma.user.findFirst({ where: { id, organizationId: req.user!.organizationId } });
  if (!target) { sendError(res, 'User not found', 404); return; }

  // Only SUPER_ADMIN can assign SUPER_ADMIN role
  if (role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    sendError(res, 'Insufficient permissions to assign this role', 403); return;
  }

  const updated = await prisma.user.update({ where: { id }, data: { role } });
  sendSuccess(res, { id: updated.id, email: updated.email, role: updated.role }, 'Role updated');
};

// ─── Toggle user active / inactive ───────────────────────────────────────────
export const toggleUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (id === req.user!.userId) { sendError(res, 'Cannot deactivate yourself', 400); return; }

  const target = await prisma.user.findFirst({ where: { id, organizationId: req.user!.organizationId } });
  if (!target) { sendError(res, 'User not found', 404); return; }

  const updated = await prisma.user.update({ where: { id }, data: { isActive: !target.isActive } });
  sendSuccess(res, { id: updated.id, isActive: updated.isActive }, `User ${updated.isActive ? 'activated' : 'deactivated'}`);
};

// ─── Delete user ──────────────────────────────────────────────────────────────
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (id === req.user!.userId) { sendError(res, 'Cannot delete yourself', 400); return; }

  const target = await prisma.user.findFirst({ where: { id, organizationId: req.user!.organizationId } });
  if (!target) { sendError(res, 'User not found', 404); return; }

  await prisma.user.delete({ where: { id } });
  sendSuccess(res, null, 'User removed');
};

// ─── Reset user password (admin sets a new one) ───────────────────────────────
export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    sendError(res, 'Password must be at least 8 characters'); return;
  }

  const target = await prisma.user.findFirst({ where: { id, organizationId: req.user!.organizationId } });
  if (!target) { sendError(res, 'User not found', 404); return; }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  sendSuccess(res, null, 'Password reset successfully');
};

// ─── Change own password ──────────────────────────────────────────────────────
export const changeOwnPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    sendError(res, 'New password must be at least 8 characters'); return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) { sendError(res, 'User not found', 404); return; }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) { sendError(res, 'Current password is incorrect', 401); return; }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  sendSuccess(res, null, 'Password changed successfully');
};

// ─── Update own profile ───────────────────────────────────────────────────────
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const { firstName, lastName } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { firstName, lastName },
    omit: { passwordHash: true },
  });

  sendSuccess(res, user, 'Profile updated');
};

// ─── Update organization ──────────────────────────────────────────────────────
export const updateOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body;

  if (!name || name.trim().length < 2) {
    sendError(res, 'Organization name must be at least 2 characters'); return;
  }

  const org = await prisma.organization.update({
    where: { id: req.user!.organizationId },
    data: { name: name.trim() },
  });

  sendSuccess(res, org, 'Organization updated');
};

// ─── SUPER ADMIN: get all organizations ───────────────────────────────────────
export const getAllOrganizations = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgs = await prisma.organization.findMany({
    include: {
      _count: { select: { users: true, applicants: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, orgs);
};

// ─── SUPER ADMIN: platform-wide stats ────────────────────────────────────────
export const getPlatformStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  const [totalOrgs, totalUsers, totalApplicants, totalActiveReps] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.applicant.count(),
    prisma.applicant.count({ where: { status: 'ACTIVE_REP' } }),
  ]);

  sendSuccess(res, { totalOrgs, totalUsers, totalApplicants, totalActiveReps });
};
