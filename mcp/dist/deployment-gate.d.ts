import { type FileInfo } from "./risk-engine.js";
import type { CiSummary, GateDecision, GateMode, MatchedContext } from "./types.js";
export interface DeploymentGateInput {
    files: FileInfo[];
    gateMode: GateMode;
    riskThreshold: number;
    warnThreshold: number;
    ciSummary?: CiSummary | null;
    freezeActive?: boolean;
    freezeMessage?: string;
    context?: MatchedContext | null;
    prRef: string;
    environment: string;
}
export interface DeploymentGateResult {
    gateDecision: GateDecision;
    riskScore: number;
    releaseReady: boolean;
    releaseReadyReasons: string[];
    approved: boolean;
    comment: string;
    factorSummary: string;
}
export declare function evaluateDeploymentGate(input: DeploymentGateInput): DeploymentGateResult;
