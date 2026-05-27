export declare function verifySignature(payload: string, signature: string, secret: string): boolean;
interface DeploymentProtectionPayload {
    action: string;
    environment: string;
    deployment: {
        id: number;
        ref: string;
        sha: string;
        creator: {
            login: string;
        };
    };
    deployment_callback_url: string;
    installation: {
        id: number;
    };
    repository: {
        full_name: string;
        default_branch: string;
    };
}
export declare function handleDeploymentProtectionRule(payload: DeploymentProtectionPayload, rawBody: string, signature: string): Promise<void>;
export {};
