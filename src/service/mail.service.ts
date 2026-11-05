// External-module work: outbound email. If no mailer is configured, log the link in
// non-production (the documented fallback in docs/API_ROUTES.md section 3.2).
import { notImplemented } from "@/utilities/not-implemented";

export interface PasswordResetMail {
  to: string;
  firstName: string;
  /** `${FRONTEND_URL}/reset-password?token=<raw>` */
  resetUrl: string;
}

export async function sendPasswordReset(_mail: PasswordResetMail): Promise<void> {
  return notImplemented("MailService.sendPasswordReset");
}
