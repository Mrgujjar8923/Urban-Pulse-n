/**
 * Pagination utility for GovAI Resolve API endpoints (Phase 7E.6).
 * Handles parameter validation, clamping, normalization, and envelope formatting.
 */

export const parsePagination = (query = {}, defaultLimit = 20, maxLimit = 100) => {
  const hasPage = query.page !== undefined && query.page !== null && query.page !== "";
  const hasLimit = query.limit !== undefined && query.limit !== null && query.limit !== "";
  const isPaginated = hasPage || hasLimit;

  let page = 1;
  if (hasPage) {
    const parsedPage = parseInt(query.page, 10);
    page = !Number.isNaN(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  }

  let limit = defaultLimit;
  if (hasLimit) {
    const parsedLimit = parseInt(query.limit, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      limit = defaultLimit;
    } else if (parsedLimit > maxLimit) {
      limit = maxLimit;
    } else {
      limit = parsedLimit;
    }
  }

  const skip = (page - 1) * limit;

  return {
    isPaginated,
    page,
    limit,
    skip,
    maxLimit,
  };
};

export const formatPaginatedResponse = (data, total, page, limit) => {
  const safeTotal = typeof total === "number" && total >= 0 ? total : 0;
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / limit) : 0;

  return {
    data,
    pagination: {
      total: safeTotal,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};
