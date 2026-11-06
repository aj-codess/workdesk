// External-module work: outbound email. If no mailer is configured, log the link in
// non-production (the documented fallback in docs/API_ROUTES.md section 3.2).
import nodemailer from "nodemailer";
import { env } from "@/config/env";
import { logger } from "@/utilities/logger";

export interface PasswordResetMail {
  to: string;
  firstName: string;
  /** `${FRONTEND_URL}/reset-password?token=<raw>` */
  resetUrl: string;
}

let transport: nodemailer.Transporter | undefined;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendPasswordReset(mail: PasswordResetMail): Promise<void> {
  if (!env.SMTP_URL) {
    if (env.NODE_ENV === "production") {
      // Never log a live reset link in production.
      logger.error("[MAIL] SMTP_URL is not configured; password reset email was not sent");
      return;
    }
    logger.info(`[MAIL] password reset link for ${mail.to}: ${mail.resetUrl}`);
    return;
  }
  transport ??= nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: mail.to,
    subject: "Reset your WorkDesk password",
    text:
      `Hi ${mail.firstName},\n\nUse the link below to choose a new password. It expires in 30 minutes and works once.\n\n` +
      `${mail.resetUrl}\n\nIf you did not ask for this, you can ignore this email.`,
    html:
      `<p>Hi ${esc(mail.firstName)},</p><p>Use the link below to choose a new password. It expires in 30 minutes and works once.</p>` +
      `<p><a href="${esc(mail.resetUrl)}">Reset your password</a></p><p>If you did not ask for this, you can ignore this email.</p>`,
  });
}
