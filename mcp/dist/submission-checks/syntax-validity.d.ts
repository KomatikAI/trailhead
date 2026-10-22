/** Parse real import nodes, never import-looking text in comments or templates. */
export declare function relativeImportSpecifiers(filename: string, content: string): string[];
/** Returns a one-line error message, or null when content parses cleanly. */
export declare function validateFileSyntax(filename: string, content: string): string | null;
