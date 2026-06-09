import nodemailer from 'nodemailer';
import { prisma } from './prisma';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MailPayload {
  to: string | string[];
  subject: string;
  html: string;
}

interface GmailConfig {
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
}

// ─── Gmail transporter (singleton-ish per call) ───────────────────────────────
function createTransporter(cfg: GmailConfig) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    tls: { rejectUnauthorized: false },
  });
}

// ─── Core send ────────────────────────────────────────────────────────────────
export async function sendMail(organizationId: string, payload: MailPayload): Promise<boolean> {
  try {
    const cfg = await prisma.smtpConfig.findUnique({ where: { organizationId } });
    if (!cfg || !cfg.isEnabled) return false;
    if (!cfg.smtpUser || !cfg.smtpPass) return false;

    const transporter = createTransporter({
      smtpUser: cfg.smtpUser,
      smtpPass: cfg.smtpPass,
      fromName: cfg.fromName,
      fromEmail: cfg.fromEmail,
    });

    const toArray = Array.isArray(payload.to) ? payload.to : [payload.to];
    await transporter.sendMail({
      from: `${cfg.fromName} <${cfg.fromEmail}>`,
      to: toArray.join(', '),
      subject: payload.subject,
      html: payload.html,
    });
    return true;
  } catch (err) {
    console.error('[Email] sendMail error:', err);
    return false;
  }
}

// ─── Test connection ──────────────────────────────────────────────────────────
export async function testEmailConfig(cfg: {
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
  testTo: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!cfg.smtpUser || !cfg.smtpPass) {
      return { success: false, message: 'Gmail address and App Password are required.' };
    }

    const transporter = createTransporter(cfg);
    await transporter.sendMail({
      from: `${cfg.fromName} <${cfg.fromEmail}>`,
      to: cfg.testTo,
      subject: '✅ OMIRA — Email setup confirmed',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:32px auto;padding:32px;
                    border-radius:12px;border:1px solid #e2e8f0;">
          <h2 style="color:#6366f1;margin:0 0 12px;">OMIRA — Gmail Connected ✅</h2>
          <p style="color:#334155;margin:0 0 8px;">
            Your Gmail SMTP is configured correctly.
          </p>
          <p style="color:#64748b;font-size:13px;margin:0;">
            Automatic interview &amp; training reminders will now be delivered from
            <strong>${cfg.fromEmail}</strong>.
          </p>
        </div>`,
    });
    return { success: true, message: `Test email sent to ${cfg.testTo}` };
  } catch (err: any) {
    console.error('[Email] test failed:', err.message);
    // Surface the most common Gmail errors clearly
    const msg: string = err.message || '';
    if (msg.includes('Invalid login') || msg.includes('Username and Password not accepted')) {
      return {
        success: false,
        message:
          'Gmail rejected the login. Make sure you are using an App Password ' +
          '(not your regular Gmail password). ' +
          'Generate one at myaccount.google.com/apppasswords.',
      };
    }
    if (msg.includes('Less secure') || msg.includes('2-Step')) {
      return {
        success: false,
        message:
          'Enable 2-Step Verification on your Google account first, ' +
          'then create an App Password at myaccount.google.com/apppasswords.',
      };
    }
    return { success: false, message: err.message || 'Failed to connect to Gmail SMTP.' };
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────
export function interviewReminderHtml(d: {
  candidateName: string; interviewDate: string;
  business: string; role: string; appUrl: string;
}): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 36px;">
      <p style="color:rgba(255,255,255,0.75);margin:0 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Interview Reminder</p>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">Tomorrow: ${d.candidateName}</h1>
    </div>
    <div style="padding:32px 36px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;border-bottom:1px solid #f1f5f9;width:40%;">Candidate</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f1f5f9;">${d.candidateName}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;border-bottom:1px solid #f1f5f9;">Date &amp; Time</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f1f5f9;">${d.interviewDate}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;border-bottom:1px solid #f1f5f9;">Business</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f1f5f9;">${d.business}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;">Role</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;">${d.role}</td></tr>
      </table>
      <a href="${d.appUrl}/applicants" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;">Open in OMIRA →</a>
    </div>
    <div style="padding:16px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Sent by OMIRA Recruiting · <a href="${d.appUrl}/settings" style="color:#6366f1;text-decoration:none;">Manage notifications</a></p>
    </div>
  </div></body></html>`;
}

export function trainingReminderHtml(d: {
  candidateName: string; trainingNumber: number;
  scheduledDate: string; business: string; appUrl: string;
}): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#7c3aed,#6366f1);padding:28px 36px;">
      <p style="color:rgba(255,255,255,0.75);margin:0 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Training ${d.trainingNumber} Reminder</p>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">Tomorrow: ${d.candidateName}</h1>
    </div>
    <div style="padding:32px 36px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;border-bottom:1px solid #f1f5f9;width:40%;">Candidate</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f1f5f9;">${d.candidateName}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;border-bottom:1px solid #f1f5f9;">Training</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f1f5f9;">Training ${d.trainingNumber}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;border-bottom:1px solid #f1f5f9;">Scheduled</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;border-bottom:1px solid #f1f5f9;">${d.scheduledDate}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:8px 0;">Business</td><td style="color:#1e293b;font-weight:600;font-size:14px;padding:8px 0;">${d.business}</td></tr>
      </table>
      <a href="${d.appUrl}/applicants" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;">Open in OMIRA →</a>
    </div>
    <div style="padding:16px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Sent by OMIRA Recruiting · <a href="${d.appUrl}/settings" style="color:#6366f1;text-decoration:none;">Manage notifications</a></p>
    </div>
  </div></body></html>`;
}

export function welcomeHtml(d: {
  firstName: string; orgName: string;
  email: string; password: string; appUrl: string;
}): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 36px;">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">Welcome to OMIRA 🎉</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${d.orgName}</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="color:#334155;font-size:15px;margin:0 0 24px;">Hi <strong>${d.firstName}</strong>! You've been added to <strong>${d.orgName}</strong> on OMIRA.</p>
      <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;border-left:4px solid #6366f1;margin-bottom:24px;">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Your login credentials</p>
        <p style="margin:0 0 4px;color:#1e293b;font-size:14px;"><strong>Email:</strong> ${d.email}</p>
        <p style="margin:0;color:#1e293b;font-size:14px;"><strong>Password:</strong> ${d.password}</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin:0 0 24px;">Please change your password after your first login.</p>
      <a href="${d.appUrl}/login" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;">Log in to OMIRA →</a>
    </div>
  </div></body></html>`;
}
