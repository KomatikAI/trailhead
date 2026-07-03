import type { RemediationAutofixClass, RemediationFix } from "./types.js";
export declare const RED_LANE_GLOBS: string[];
export interface AutofixPlanItem {
    fix: RemediationFix;
    files: string[];
    autofix_class: RemediationAutofixClass;
}
export interface AutofixPlan {
    items: AutofixPlanItem[];
    blocked: Array<{
        fix: RemediationFix;
        reason: string;
    }>;
}
export declare function isRedLanePath(filePath: string): boolean;
export declare function isAutofixClassAllowed(autofixClass: RemediationAutofixClass): boolean;
export declare function buildAutofixPlan(fixes: RemediationFix[]): AutofixPlan;
/** Max one fix commit per gate round (Phase B2). */
export declare function selectAutofixCommit(plan: AutofixPlan): AutofixPlanItem | null;
