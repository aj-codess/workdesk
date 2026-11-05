import { z } from "zod";

export const settingParams = z.object({ key: z.string().min(1).max(100) });
/** The value is validated per key by SETTING_SCHEMAS in the controller. */
export const updateSettingBody = z.object({ value: z.unknown() }).strict();
