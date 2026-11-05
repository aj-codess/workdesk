import { Errors } from "@/utilities/api-error";
import { success } from "@/utilities/api-response";
import { parseBody, parseParams, parseQuery } from "@/utilities/request";
import { buildMeta } from "@/types/pagination";
import * as CategoryModel from "@/models/category.model";
import { idParams } from "@/validators/common";
import { createCategoryBody, listCategoriesQuery, updateCategoryBody } from "@/validators/category.validator";
import type { ProtectedContext } from "@/types/auth";

type IdParams = { id: string };

/** GET /categories */
export async function list({ req }: ProtectedContext) {
  const query = parseQuery(req, listCategoriesQuery);
  const { rows, total } = await CategoryModel.list(query);
  return success(rows, { meta: buildMeta(query, total) });
}

/** POST /categories : categories.manage + department scope (null = out of scope = 404). */
export async function create({ req, auth }: ProtectedContext) {
  const body = await parseBody(req, createCategoryBody);
  const category = await CategoryModel.create(body, auth);
  if (!category) throw Errors.notFound("Department");
  return success(category, { status: 201 });
}

/** GET /categories/:id */
export async function get({ params }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const category = await CategoryModel.findById(id);
  if (!category) throw Errors.notFound("Category");
  return success(category);
}

/** PATCH /categories/:id */
export async function update({ req, params, auth }: ProtectedContext<IdParams>) {
  const { id } = parseParams(params, idParams);
  const body = await parseBody(req, updateCategoryBody);
  const category = await CategoryModel.update(id, body, auth);
  if (!category) throw Errors.notFound("Category");
  return success(category);
}
