import { PaginationQueryDto } from '../dto/pagination-query.dto';
import {
  PaginatedResponse,
  PaginationMeta,
  PaginationParams,
} from '../types/paginated-response.type';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
} from '../dto/pagination-query.dto';

export function getPaginationParams(dto: PaginationQueryDto): PaginationParams {
  const page = dto.page ?? PAGINATION_DEFAULT_PAGE;
  const limit = dto.limit ?? PAGINATION_DEFAULT_LIMIT;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  totalItems: number,
): PaginationMeta {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

export function buildPaginatedResponse<T>(
  items: T[],
  page: number,
  limit: number,
  totalItems: number,
): PaginatedResponse<T> {
  return {
    items,
    pagination: buildPaginationMeta(page, limit, totalItems),
  };
}
