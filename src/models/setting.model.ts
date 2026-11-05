// application_settings. Keys are whitelisted in config/settings.ts.
import type { AuthContext } from "@/types/auth";
import type { Setting } from "@/types/dto";
import type { SettingKey } from "@/config/settings";
import { notImplemented } from "@/utilities/not-implemented";

export async function list(): Promise<Setting[]> {
  return notImplemented("SettingModel.list");
}

export async function findByKey(_key: string): Promise<Setting | null> {
  return notImplemented("SettingModel.findByKey");
}

/** Typed value with fallback to SETTING_DEFAULTS when the row does not exist. Used by other controllers/models. */
export async function getValue<T = unknown>(_key: SettingKey): Promise<T> {
  return notImplemented("SettingModel.getValue");
}

/** Audit: settings.updated with before/after. The controller has already validated `value` for this key. */
export async function upsert(_key: SettingKey, _value: unknown, _auth: AuthContext): Promise<Setting> {
  return notImplemented("SettingModel.upsert");
}
