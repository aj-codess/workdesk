import { SETTING_SCHEMAS, isSettingKey } from "@/config/settings";
import { Errors } from "@/utilities/api-error";
import { success } from "@/utilities/api-response";
import { parseBody, parseParams } from "@/utilities/request";
import * as SettingModel from "@/models/setting.model";
import { settingParams, updateSettingBody } from "@/validators/setting.validator";
import type { ProtectedContext } from "@/types/auth";

type KeyParams = { key: string };

/** GET /settings */
export async function list(_ctx: ProtectedContext) {
  return success(await SettingModel.list());
}

/** GET /settings/:key : unknown key = 404. */
export async function get({ params }: ProtectedContext<KeyParams>) {
  const { key } = parseParams(params, settingParams);
  const setting = isSettingKey(key) ? await SettingModel.findByKey(key) : null;
  if (!setting) throw Errors.notFound("Setting");
  return success(setting);
}

/** PUT /settings/:key : unknown key, wrong type or out of range = 400. */
export async function update({ req, params, auth }: ProtectedContext<KeyParams>) {
  const { key } = parseParams(params, settingParams);
  if (!isSettingKey(key)) throw Errors.validation(`Unknown setting key: ${key}`);
  const { value } = await parseBody(req, updateSettingBody);
  const parsed = SETTING_SCHEMAS[key].parse(value); // ZodError -> 400 VALIDATION_ERROR
  return success(await SettingModel.upsert(key, parsed, auth));
}
