import {
    app,
    HttpRequest,
    HttpResponseInit,
    InvocationContext,
} from "@azure/functions";
import OctokitApi from "./OctokitApi";

// ESM imports Workaround
const octokit_import = import("octokit");
const octorest_import = import("@octokit/rest");

const pat = process.env.GITHUB_REPO_PAT;
const repo = process.env.GITHUB_REPO;
const owner = process.env.GITHUB_REPO_OWNER;

export async function api(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const githubApi = new OctokitApi(
        (await octokit_import),
        (await octorest_import),
        pat,
        repo,
        owner,
        context
    );

    try {
        if (parseInt((await githubApi.checkRateLimits()).remaining) > 0) {
            // TODO: filter for main branch
            // const sha = (await githubApi.listBranches())[0].commit.sha
            await githubApi.uploadToRepo(`./`)


            return {
                body: JSON.stringify({ "data": "Success" }),
                // body: JSON.stringify(await githubApi.createBranch("test", sha)),
                headers: { "Content-Type": "application/json" },
            };
        } else {
            return { body: "Too many requests", status: 429 };
        }
    } catch (e) {
        context.error(e);
        return { status: 500 };
    }
}

