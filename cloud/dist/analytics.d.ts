import type { DeployEventPayload, StoredEvaluation } from "./types.js";
export interface AnalyticsOptions {
    repoId?: string;
    days: number;
    now?: Date;
}
export interface RiskTrendPoint {
    date: string;
    avgRisk: number;
    count: number;
}
export declare function computeRiskTrend(rows: StoredEvaluation[], options: AnalyticsOptions): RiskTrendPoint[];
export interface ReleaseReadyStats {
    pass: number;
    fail: number;
    unknown: number;
    passRate: number;
    byContext: Record<string, {
        pass: number;
        fail: number;
    }>;
}
export declare function computeReleaseReadyStats(rows: StoredEvaluation[], options: AnalyticsOptions): ReleaseReadyStats;
export interface CiFailureCorrelation {
    total: number;
    ciFailed: number;
    releaseReadyFailed: number;
    both: number;
    ciFailedOnly: number;
    releaseReadyFailedOnly: number;
}
export declare function computeCiFailureCorrelation(rows: StoredEvaluation[], options: AnalyticsOptions): CiFailureCorrelation;
export interface DoraProxyPanel {
    deploymentFrequencyPerWeek: number;
    changeFailureRate: number;
    avgLeadTimeHours: number | null;
    avgRiskScore: number;
    rating: "Elite" | "High" | "Medium" | "Low";
}
export declare function computeDoraProxy(evaluations: StoredEvaluation[], deployEvents: Array<{
    orgId: string;
    payload: DeployEventPayload;
}>, options: AnalyticsOptions): DoraProxyPanel;
export interface CfrStats {
    successes: number;
    failures: number;
    cancelled: number;
    cfr: number;
}
export declare function computeCfrStats(deployEvents: Array<{
    orgId: string;
    payload: DeployEventPayload;
}>, options: AnalyticsOptions): CfrStats;
export interface AgentLoopEfficiencyRow {
    agentId: string;
    evaluations: number;
    readyCount: number;
    blockedCount: number;
    medianRoundsToReady: number | null;
}
export interface AgentLoopEfficiencyPanel {
    windowDays: number;
    repoId: string | null;
    agents: AgentLoopEfficiencyRow[];
    fleetMedianRoundsToReady: number | null;
}
export declare function computeAgentLoopEfficiency(rows: StoredEvaluation[], options: AnalyticsOptions): AgentLoopEfficiencyPanel;
export interface DashboardAnalytics {
    windowDays: number;
    repoId: string | null;
    riskTrend: RiskTrendPoint[];
    releaseReady: ReleaseReadyStats;
    ciCorrelation: CiFailureCorrelation;
    dora: DoraProxyPanel;
    cfr: CfrStats;
    agentLoopEfficiency: AgentLoopEfficiencyPanel;
}
export declare function buildDashboardAnalytics(evaluations: StoredEvaluation[], deployEvents: Array<{
    orgId: string;
    payload: DeployEventPayload;
}>, options: AnalyticsOptions): DashboardAnalytics;
