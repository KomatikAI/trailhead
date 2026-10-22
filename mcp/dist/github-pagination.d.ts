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
export declare function collectGitHubPages<T>(fetchPage: (page: number, perPage: number) => Promise<T[]>, options?: PaginationOptions): Promise<PaginationResult<T>>;
/** Fetch every available JSON-array page from a GitHub REST URL. */
export declare function fetchGitHubJsonPages<T>(url: string, init: RequestInit, options?: PaginationOptions): Promise<PaginationResult<T>>;
