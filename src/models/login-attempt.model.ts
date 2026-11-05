import { notImplemented } from "@/utilities/not-implemented";

/** Append a login_attempts row. No FK to users, so unknown-email attempts are recorded too. */
export async function record(_input: {
  email: string;
  ip: string | null;
  success: boolean;
  failureReason?: string;
}): Promise<void> {
  return notImplemented("LoginAttemptModel.record");
}
