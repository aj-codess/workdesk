// Whitelisted application settings (docs/API_ROUTES.md Appendix C).
import { z } from "zod";

export const MIME_TYPES = ["image/png", "image/jpeg", "application/pdf", "text/plain"] as const;

export const SETTING_SCHEMAS = {
  "department.max_managers": z.number().int().min(1).max(10),
  "auth.max_failed_logins": z.number().int().min(3).max(10),
  "auth.lockout_minutes": z.number().int().min(1).max(1440),
  "attachments.max_size_mb": z.number().int().min(1).max(25),
  "attachments.allowed_mime_types": z.array(z.enum(MIME_TYPES)),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;

export const SETTING_DEFAULTS: Record<SettingKey, unknown> = {
  "department.max_managers": 3,
  "auth.max_failed_logins": 5,
  "auth.lockout_minutes": 15,
  "attachments.max_size_mb": 5,
  "attachments.allowed_mime_types": [...MIME_TYPES],
};

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_SCHEMAS;
}
