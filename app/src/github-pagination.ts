export interface PaginationResult<T> {
  items: T[];
  pages: number;
  complete: boolean;
}

export interface PaginationOptions {
  /** GitHub REST APIs cap per_page at 100. */
  perPage?: number;
  /** Safety ceiling for endpoints with a documented result cap. */
  maxPages?: number;
}

/**
 * Collect a GitHub REST endpoint page-by-page. A full final page is treated as
 * incomplete when maxPages is reached so callers can surface truncated input.
 */
export async function collectGitHubPages<T>(
  fetchPage: (page: number, perPage: number) => Promise<T[]>,
  options: PaginationOptions = {},
): Promise<PaginationResult<T>> {
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));
  const maxPages = Math.max(1, options.maxPages ?? 30);
  const items: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageItems = await fetchPage(page, perPage);
    items.push(...pageItems);

    if (pageItems.length < perPage) {
      return { items, pages: page, complete: true };
    }
  }

  return { items, pages: maxPages, complete: false };
}

/** Fetch every available JSON-array page from a GitHub REST URL. */
export async function fetchGitHubJsonPages<T>(
  url: string,
  init: RequestInit,
  options: PaginationOptions = {},
): Promise<PaginationResult<T>> {
  return collectGitHubPages<T>(async (page, perPage) => {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("per_page", String(perPage));
    pageUrl.searchParams.set("page", String(page));
    const response = await fetch(pageUrl, init);
    if (!response.ok) {
      throw new Error(`GitHub request failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error("GitHub paginated response was not an array");
    }
    return data as T[];
  }, options);
}
