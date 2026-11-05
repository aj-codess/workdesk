import { Errors } from "@/utilities/api-error";
import { success } from "@/utilities/api-response";
import { parseBody } from "@/utilities/request";
import * as UserModel from "@/models/user.model";
import { updateProfileBody } from "@/validators/auth.validator";
import type { ProtectedContext } from "@/types/auth";

/** PATCH /profile : self only. The id comes from the token, never from the body. */
export async function update({ req, auth }: ProtectedContext) {
  const body = await parseBody(req, updateProfileBody);
  const user = await UserModel.updateProfile(auth.userId, body);
  if (!user) throw Errors.notFound("User");
  return success(user);
}
