import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/** 200 with a single resource or an arbitrary payload. */
export function sendOk<T>(res: Response, data: T): Response {
  return res.status(200).json({ success: true, data } satisfies SuccessBody<T>);
}

/** 201 for successful creation. */
export function sendCreated<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data } satisfies SuccessBody<T>);
}

/** 200 with a page of results plus the metadata the frontend pager needs. */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  { page, limit, total }: { page: number; limit: number; total: number },
): Response {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
  return res.status(200).json({ success: true, data, meta } satisfies SuccessBody<T[]>);
}
