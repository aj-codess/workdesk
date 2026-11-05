import { NextResponse } from "next/server";

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function success<T>(
  data: T,
  options: { status?: number; message?: string; meta?: PageMeta } = {}
) {
  return NextResponse.json(
    {
      success: true,
      message: options.message ?? "Request completed successfully",
      data,
      ...(options.meta === undefined ? {} : { meta: options.meta })
    },
    { status: options.status ?? 200 }
  );
}

/** 204 has no body. */
export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function failure(
  message: string,
  status: number,
  details?: unknown,
  code?: string
) {
  return NextResponse.json(
    {
      success: false,
      message,
      ...(code === undefined ? {} : { code }),
      ...(details === undefined ? {} : { details })
    },
    { status }
  );
}
