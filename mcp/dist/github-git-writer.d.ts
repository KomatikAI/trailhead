import type { FileEdit, GitWriter } from "./autofix-executor.js";
type GitTreeMode = "100644" | "100755" | "040000" | "160000" | "120000";
export interface GitRestClient {
    rest: {
        git: {
            getRef(p: {
                owner: string;
                repo: string;
                ref: string;
            }): Promise<{
                data: {
                    object: {
                        sha: string;
                    };
                };
            }>;
            getCommit(p: {
                owner: string;
                repo: string;
                commit_sha: string;
            }): Promise<{
                data: {
                    tree: {
                        sha: string;
                    };
                };
            }>;
            createBlob(p: {
                owner: string;
                repo: string;
                content: string;
                encoding: string;
            }): Promise<{
                data: {
                    sha: string;
                };
            }>;
            createTree(p: {
                owner: string;
                repo: string;
                base_tree: string;
                tree: Array<{
                    path: string;
                    mode: GitTreeMode;
                    type: "blob";
                    sha: string;
                }>;
            }): Promise<{
                data: {
                    sha: string;
                };
            }>;
            createCommit(p: {
                owner: string;
                repo: string;
                message: string;
                tree: string;
                parents: string[];
            }): Promise<{
                data: {
                    sha: string;
                };
            }>;
            updateRef(p: {
                owner: string;
                repo: string;
                ref: string;
                sha: string;
                force?: boolean;
            }): Promise<unknown>;
        };
    };
}
export declare class GithubGitWriter implements GitWriter {
    private readonly client;
    private readonly owner;
    private readonly repo;
    constructor(client: GitRestClient, owner: string, repo: string);
    commitFiles(args: {
        branch: string;
        message: string;
        edits: FileEdit[];
    }): Promise<{
        commitSha: string;
    }>;
}
export {};
