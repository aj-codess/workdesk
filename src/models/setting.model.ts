// application_settings. Keys are whitelisted in config/settings.ts.
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import type { AuthContext } from "@/types/auth";
import type { Setting } from "@/types/dto";
import { SETTING_DEFAULTS, isSettingKey, type SettingKey } from "@/config/settings";
import { iso, toUserRef, userRefSelect } from "@/utilities/mappers";
import * as AuditLogModel from "@/models/audit-log.model";

const include = { updatedBy: { select: userRefSelect } } as const;
type Row = Prisma.ApplicationSettingGetPayload<{ include: typeof include }>;

const toSetting = (r: Row): Setting => ({
  key: r.key, value: r.value, description: r.description, updatedAt: iso(r.updatedAt),
  updatedBy: r.updatedBy ? toUserRef(r.updatedBy) : null,
});

const defaultSetting = (key: SettingKey): Setting => ({
  key, value: SETTING_DEFAULTS[key], description: null, updatedAt: new Date(0).toISOString(), updatedBy: null,
});

/** Every whitelisted key: the stored row, or the default when nothing has been saved yet. */
export async function list(): Promise<Setting[]> {
  const rows = await prisma.applicationSetting.findMany({ include });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((k) => {
    const row = byKey.get(k);
    return row ? toSetting(row) : defaultSetting(k);
  });
}

export async function findByKey(key: string): Promise<Setting | null> {
  if (!isSettingKey(key)) return null;
  const row = await prisma.applicationSetting.findUnique({ where: { key }, include });
  return row ? toSetting(row) : defaultSetting(key);
}

/** Typed value with fallback to SETTING_DEFAULTS when the row does not exist. Used by other controllers/models. */
export async function getValue<T = unknown>(key: SettingKey): Promise<T> {
  const row = await prisma.applicationSetting.findUnique({ where: { key } });
  return (row ? row.value : SETTING_DEFAULTS[key]) as T;
}

/** Audit: settings.updated with before/after. The controller has already validated `value` for this key. */
export async function upsert(key: SettingKey, value: unknown, auth: AuthContext): Promise<Setting> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.applicationSetting.findUnique({ where: { key } });
    const row = await tx.applicationSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedById: auth.userId },
      update: { value: value as Prisma.InputJsonValue, updatedById: auth.userId },
      include,
    });
    await AuditLogModel.record(
      {
        actorId: auth.userId, action: "settings.updated", entityType: "setting", entityId: key,
        before: { value: existing ? existing.value : SETTING_DEFAULTS[key] }, after: { value },
        ip: auth.ip, userAgent: auth.userAgent,
      },
      tx
    );
    return toSetting(row);
  });
}
