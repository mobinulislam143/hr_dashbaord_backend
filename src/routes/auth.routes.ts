import { Router } from 'express';
import {
  register,
  login,
  getMe,
  inviteUser,
  getTeamMembers,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  resetUserPassword,
  changeOwnPassword,
  updateProfile,
  updateOrganization,
  getAllOrganizations,
  getPlatformStats,
} from '../controllers/auth.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// ─── Public ──────────────────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login',    login);

// ─── Authenticated (own account) ─────────────────────────────────────────────
router.get('/me',           authenticate, getMe);
router.patch('/profile',    authenticate, updateProfile);
router.patch('/password',   authenticate, changeOwnPassword);

// ─── Team management (ADMIN+) ────────────────────────────────────────────────
router.post('/invite',      authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), inviteUser);
router.get('/team',         authenticate, getTeamMembers);

// ─── User management (ADMIN+) ────────────────────────────────────────────────
router.patch('/users/:id/role',           authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), updateUserRole);
router.patch('/users/:id/toggle',         authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), toggleUserStatus);
router.delete('/users/:id',               authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), deleteUser);
router.patch('/users/:id/reset-password', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), resetUserPassword);

// ─── Organization settings (ADMIN+) ──────────────────────────────────────────
router.patch('/org', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), updateOrganization);

// ─── Super Admin only ─────────────────────────────────────────────────────────
router.get('/admin/orgs',  authenticate, requireRole('SUPER_ADMIN'), getAllOrganizations);
router.get('/admin/stats', authenticate, requireRole('SUPER_ADMIN'), getPlatformStats);

export default router;
