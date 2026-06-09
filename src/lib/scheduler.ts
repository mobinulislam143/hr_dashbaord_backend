import cron from 'node-cron';
import { prisma } from './prisma';
import { sendMail, interviewReminderHtml, trainingReminderHtml } from './email.service';

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const BUSINESS_LABELS: Record<string, string> = {
  VEXON: 'Vexon', EASYSCALE: 'EasyScale', TELENZA: 'Telenza',
  SOLV_GLOBAL: 'Solv Global', CTC_COURTS: 'CTC Courts',
};
const ROLE_LABELS: Record<string, string> = {
  SETTER: 'Setter', HYBRID_REP: 'Hybrid Rep',
  FULL_CYCLE_CLOSER: 'Full Cycle Closer', SALES_MANAGER: 'Sales Manager',
};

async function sendInterviewReminders() {
  const configs = await prisma.smtpConfig.findMany({
    where: { isEnabled: true, interviewReminder: true },
  });

  for (const cfg of configs) {
    const now = new Date();
    const windowStart = new Date(now.getTime() + (cfg.reminderHoursBefore - 1) * 3600_000);
    const windowEnd   = new Date(now.getTime() + (cfg.reminderHoursBefore + 1) * 3600_000);

    const upcoming = await prisma.interview.findMany({
      where: {
        interviewDate: { gte: windowStart, lte: windowEnd },
        reminderSentAt: null,
        applicant: { organizationId: cfg.organizationId },
      },
      include: { applicant: true },
    });

    if (!upcoming.length) continue;

    const managers = await prisma.user.findMany({
      where: { organizationId: cfg.organizationId, isActive: true, role: { in: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] } },
      select: { email: true },
    });
    const emails = managers.map(m => m.email);
    if (!emails.length) continue;

    for (const interview of upcoming) {
      const dateStr = interview.interviewDate
        ? new Date(interview.interviewDate).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
        : 'Time TBD';

      const sent = await sendMail(cfg.organizationId, {
        to: emails,
        subject: `📅 Interview tomorrow: ${interview.applicant.fullName}`,
        html: interviewReminderHtml({
          candidateName: interview.applicant.fullName,
          interviewDate: dateStr,
          business: BUSINESS_LABELS[interview.applicant.business] || interview.applicant.business,
          role: ROLE_LABELS[interview.applicant.role] || interview.applicant.role,
          appUrl: APP_URL,
        }),
      });

      if (sent) {
        await prisma.interview.update({ where: { id: interview.id }, data: { reminderSentAt: new Date() } });
        console.log(`[Scheduler] Interview reminder → ${interview.applicant.fullName}`);
      }
    }
  }
}

async function sendTrainingReminders() {
  const configs = await prisma.smtpConfig.findMany({
    where: { isEnabled: true, trainingReminder: true },
  });

  for (const cfg of configs) {
    const now = new Date();
    const windowStart = new Date(now.getTime() + (cfg.reminderHoursBefore - 1) * 3600_000);
    const windowEnd   = new Date(now.getTime() + (cfg.reminderHoursBefore + 1) * 3600_000);

    const upcoming = await prisma.training.findMany({
      where: {
        scheduledDate: { gte: windowStart, lte: windowEnd },
        reminderSentAt: null,
        applicant: { organizationId: cfg.organizationId },
      },
      include: { applicant: true },
    });

    if (!upcoming.length) continue;

    const managers = await prisma.user.findMany({
      where: { organizationId: cfg.organizationId, isActive: true, role: { in: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] } },
      select: { email: true },
    });
    const emails = managers.map(m => m.email);
    if (!emails.length) continue;

    for (const training of upcoming) {
      const dateStr = training.scheduledDate
        ? new Date(training.scheduledDate).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
        : 'Date TBD';

      const sent = await sendMail(cfg.organizationId, {
        to: emails,
        subject: `📚 Training ${training.trainingNumber} tomorrow: ${training.applicant.fullName}`,
        html: trainingReminderHtml({
          candidateName: training.applicant.fullName,
          trainingNumber: training.trainingNumber,
          scheduledDate: dateStr,
          business: BUSINESS_LABELS[training.applicant.business] || training.applicant.business,
          appUrl: APP_URL,
        }),
      });

      if (sent) {
        await prisma.training.update({ where: { id: training.id }, data: { reminderSentAt: new Date() } });
        console.log(`[Scheduler] Training ${training.trainingNumber} reminder → ${training.applicant.fullName}`);
      }
    }
  }
}

export function startScheduler() {
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Running reminder check…');
    await Promise.allSettled([sendInterviewReminders(), sendTrainingReminders()]);
  });
  console.log('⏰  Scheduler started — checks every hour on the hour');
}
