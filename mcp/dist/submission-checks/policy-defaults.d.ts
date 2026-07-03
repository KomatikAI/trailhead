export interface RenamePatternEntry {
    oldName: string;
    newName: string;
    pattern: RegExp;
}
export declare const DEFAULT_RENAME_PATTERNS: RenamePatternEntry[];
/** @deprecated use DEFAULT_RENAME_PATTERNS */
export declare const OLD_NAME_PATTERNS: RenamePatternEntry[];
export declare const DEFAULT_SLUG_ONLY_PATTERN_SOURCES: string[];
export declare const DEFAULT_ARTIFACT_FILE_GLOBS: string[];
export declare function compileRenamePattern(oldName: string, newName: string): RenamePatternEntry;
export declare function compileSlugOnlyPatterns(sources: string[]): RegExp[];
