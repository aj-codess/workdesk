import type { Paginated } from "@/types/pagination";
import type { AuthContext } from "@/types/auth";
import type { Category } from "@/types/dto";
import type { CreateCategoryBody, ListCategoriesQuery, UpdateCategoryBody } from "@/validators/category.validator";
import { notImplemented } from "@/utilities/not-implemented";

export async function list(_query: ListCategoriesQuery): Promise<Paginated<Category>> {
  return notImplemented("CategoryModel.list");
}

export async function findById(_id: string): Promise<Category | null> {
  return notImplemented("CategoryModel.findById");
}

/**
 * Department scope: the caller must manage the category's department, unless they hold `departments.update`.
 * Out of scope -> return null (the controller answers 404). Throw 409 CONFLICT (name unique per department).
 */
export async function create(_input: CreateCategoryBody, _auth: AuthContext): Promise<Category | null> {
  return notImplemented("CategoryModel.create");
}

/** Same scope rule as create. departmentId is immutable. */
export async function update(_id: string, _input: UpdateCategoryBody, _auth: AuthContext): Promise<Category | null> {
  return notImplemented("CategoryModel.update");
}
