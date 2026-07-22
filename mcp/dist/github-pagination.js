/**
 * Collect a GitHub REST endpoint page-by-page. A full final page is treated as
 * incomplete when maxPages is reached so callers can surface truncated input.
 */
export async function collectGitHubPages(fetchPage, options = {}) {
    const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));
    const maxPages = Math.max(1, options.maxPages ?? 30);
    const items = [];
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
export async function fetchGitHubJsonPages(url, init, options = {}) {
    return collectGitHubPages(async (page, perPage) => {
        const pageUrl = new URL(url);
        pageUrl.searchParams.set("per_page", String(perPage));
        pageUrl.searchParams.set("page", String(page));
        const response = await fetch(pageUrl, init);
        if (!response.ok) {
            throw new Error(`GitHub request failed: HTTP ${response.status}`);
        }
        const data = (await response.json());
        if (!Array.isArray(data)) {
            throw new Error("GitHub paginated response was not an array");
        }
        return data;
    }, options);
}
