import type { NextRequest } from "next/server";
import { Errors } from "@/utilities/api-error";
import { getBearerToken, getRequestMeta } from "@/utilities/request";
import * as TokenService from "@/service/token.service";
import * as SessionModel from "@/models/session.model";
import * as PermissionModel from "@/models/permission.model";
import type { AuthContext } from "@/types/auth";

/**
 * Pipeline steps 1 and 2 (docs/architecture.md section 4):
 *   1. verify the access JWT (signature + expiry)        -> TokenService (external module)
 *   2. session is live and the user is ACTIVE            -> SessionModel (database)
 * then resolve the effective permissions for THIS request, so role changes apply immediately.
 */
export async function authenticate(req: NextRequest): Promise<AuthContext> {
  const token = getBearerToken(req);
  if (!token) throw Errors.unauthenticated();

  const claims = await TokenService.verifyAccessToken(token);

  const session = await SessionModel.findLive(claims.sid);
  if (!session || session.userId !== claims.sub) throw Errors.sessionRevoked();

  const permissions = await PermissionModel.getEffectiveKeys(claims.sub);

  return { userId: claims.sub, sessionId: claims.sid, permissions, ...getRequestMeta(req) };
}
