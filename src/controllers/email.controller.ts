import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { testEmailConfig, sendMail, welcomeHtml } from '../lib/email.service';

// ─── Get email config (App Password masked) ───────────────────────────────────
export const getEmailConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  const cfg = await prisma.smtpConfig.findUnique({
    where: { organizationId: req.user!.organizationId },
  });
  if (!cfg) { sendSuccess(res, null, 'No email config yet'); return; }

  sendSuccess(res, {
    ...cfg,
    smtpPass:     cfg.smtpPass ? '••••••••' : '',
    _hasSmtpPass: !!cfg.smtpPass,
  });
};

// ─── Save email config ────────────────────────────────────────────────────────
export const saveEmailConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  const orgId = req.user!.organizationId;
  const { smtpUser, smtpPass, fromName, fromEmail,
          isEnabled, interviewReminder, trainingReminder, reminderHoursBefore } = req.body;

  if (!smtpUser || !fromName || !fromEmail) {
    sendError(res, 'Gmail address, From Name and From Email are required'); return;
  }

  // Keep existing App Password if user left the masked placeholder
  const existing = await prisma.smtpConfig.findUnique({ where: { organizationId: orgId } });
  const resolvedPass = (smtpPass === '••••••••' || !smtpPass)
    ? (existing?.smtpPass ?? null)
    : smtpPass;

  if (!resolvedPass) {
    sendError(res, 'App Password is required'); return;
  }

  const data = {
    provider:            'smtp',
    smtpHost:            'smtp.gmail.com',
    smtpPort:            587,
    smtpSecure:          false,
    smtpUser:            smtpUser.trim(),
    smtpPass:            resolvedPass,
    fromName:            fromName.trim(),
    fromEmail:           fromEmail.trim(),
    isEnabled:           isEnabled !== false,
    interviewReminder:   interviewReminder !== false,
    trainingReminder:    trainingReminder  !== false,
    reminderHoursBefore: parseInt(reminderHoursBefore) || 24,
    apiKey:              null,
  };

  const cfg = await prisma.smtpConfig.upsert({
    where:  { organizationId: orgId },
    create: { organizationId: orgId, ...data },
    update: data,
  });

  sendSuccess(res, { ...cfg, smtpPass: '••••••••', _hasSmtpPass: true }, 'Email settings saved');
};

// ─── Send test email ──────────────────────────────────────────────────────────
export const sendTestEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  const { to } = req.body;
  if (!to) { sendError(res, 'Recipient email required'); return; }

  const cfg = await prisma.smtpConfig.findUnique({ where: { organizationId: req.user!.organizationId } });
  if (!cfg) { sendError(res, 'No email config saved yet'); return; }
  if (!cfg.smtpUser || !cfg.smtpPass) { sendError(res, 'Gmail credentials not configured'); return; }

  const result = await testEmailConfig({
    smtpUser:  cfg.smtpUser,
    smtpPass:  cfg.smtpPass,
    fromName:  cfg.fromName,
    fromEmail: cfg.fromEmail,
    testTo:    to,
  });

  if (result.success) sendSuccess(res, null, result.message);
  else sendError(res, result.message, 400);
};

// ─── Called from auth controller on invite ────────────────────────────────────
export const sendWelcomeEmail = async (
  organizationId: string,
  firstName: string,
  orgName: string,
  email: string,
  password: string,
  appUrl: string,
) => {
  await sendMail(organizationId, {
    to:      email,
    subject: `Welcome to ${orgName} on OMIRA 🎉`,
    html:    welcomeHtml({ firstName, orgName, email, password, appUrl }),
  });
};
