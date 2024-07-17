import { InvocationContext } from "@azure/functions/types/InvocationContext";
import path from "path";
import { readFile } from "fs-extra";

export default class OctokitApi {
  octokit: any;
  octoRest: any;
  options: any;
  context: InvocationContext;
  constructor(
    octokit: any,
    octoRest: any,
    pat: string,
    repo: string,
    owner: string,
    context: InvocationContext
  ) {
    this.octokit = new octokit.Octokit({ auth: pat });
    this.octoRest = new octoRest.Octokit({ auth: pat });
    this.context = context;
    this.options = {
      owner,
      repo,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
  }
  async checkRateLimits() {
    const reponse = await this.octokit.request(
      "GET /rate_limit",
      this.options.headers
    );
    return { remaining: `${reponse.data.resources.core.remaining}` };
  }

  async openPullRequest(head: string) {
    let response = null;
    response = await this.octokit.request("POST /repos/{owner}/{repo}/pulls", {
      ...this.options,
      title: "New Automated Pull Request",
      body: "Please pull these awesome changes in!",
      head,
      base: "main",
    });
  }

  async createRepoInOrg(name: string) {
    await this.octoRest.repos.createInOrg({
      org: this.options.owner,
      name,
      auto_init: true,
    });
  }

  async uploadToRepo(coursePath: string, branch: string = "main") {
    // gets commit's AND its tree's SHA
    const currentCommit = await this.getCurrentCommit(branch);
    await (async () => {
      const { globby, globbySync } = await import("globby");
      const filesPaths = await globbySync(coursePath, {gitignore: true});
      
      this.context.error(filesPaths)
      const filesBlobs = await Promise.all(
        filesPaths.map(this.createBlobForFile())
      );

      const pathsForBlobs = filesPaths.map((fullPath) =>
        path.relative(coursePath, fullPath).replace(/\\/g, '/')
    );    
      const newTree = await this.createNewTree(
        filesBlobs,
        pathsForBlobs,
        currentCommit.treeSha
      );
      const commitMessage = `My commit message`;
      const newCommit = await this.createNewCommit(
        commitMessage,
        newTree.sha,
        currentCommit.commitSha
      );
      await this.setBranchToCommit(branch, newCommit.sha);
    })();
  }

  async getCurrentCommit(branch: string = "main") {
    const { data: refData } = await this.octoRest.git.getRef({
      ...this.options,
      ref: `heads/${branch}`,
    });
    const commitSha = refData.object.sha;
    const { data: commitData } = await this.octoRest.git.getCommit({
      owner: this.options.owner,
      repo: this.options.repo,
      commit_sha: commitSha,
    });
    return {
      commitSha,
      treeSha: commitData.tree.sha,
    };
  }

  // Notice that readFile's utf8 is typed differently from Github's utf-8
  getFileAsUTF8 = (filePath: string) => readFile(filePath, "utf8");

  createBlobForFile = () => async (filePath: string) => {
    const content = await this.getFileAsUTF8(filePath);
    const blobData = await this.octoRest.git.createBlob({
      owner: this.options.owner,
      repo: this.options.repo,
      content,
      encoding: "utf-8",
    });
    return blobData.data;
  };

  createNewTree = async (
    // blobs: Octokit.GitCreateBlobResponse[],
    blobs: { sha: string }[],
    paths: string[],
    parentTreeSha: string
  ) => {
    // My custom config. Could be taken as parameters
    const tree = blobs.map(({ sha }, index) => ({
      path: paths[index],
      mode: `100644`,
      type: `blob`,
      sha,
    })) as any[];
    const { data } = await this.octoRest.git.createTree({
      owner: this.options.owner,
      repo: this.options.repo,
      tree,
      base_tree: parentTreeSha,
    });
    return data;
  };

  createNewCommit = async (
    message: string,
    currentTreeSha: string,
    currentCommitSha: string
  ) =>
    (
      await this.octoRest.git.createCommit({
        owner: this.options.owner,
        repo: this.options.repo,
        message,
        tree: currentTreeSha,
        parents: [currentCommitSha],
      })
    ).data;

  setBranchToCommit = (branch: string = `main`, commitSha: string) =>
    this.octoRest.git.updateRef({
      owner: this.options.owner,
      repo: this.options.repo,
      ref: `heads/${branch}`,
      sha: commitSha,
    });

  async commitFile(content: string) {
    let response = await this.octoRest.commitFile({
      ...this.options,
      message: "Add new file",
      content,
    });
  }
  async createBranch(branch: string, sha: string) {
    let response = await this.octokit.request(
      "POST /repos/{owner}/{repo}/git/refs",
      {
        ref: `refs/heads/${branch}`,
        sha,
        ...this.options,
        ...{
          headers: {
            ...this.options.headers,
            Accept: "application/vnd.github.v3+json",
          },
        },
      }
    );
    //     gh api \
    //   --method POST \
    //   -H  \
    //   /repos/OWNER/REPO/git/refs \
    //   -f ref='refs/heads/featureA'
    //  -f sha='aa218f56b14c9653891f9e74264a383fa43fefbd'
  }
  async listBranches() {
    let response = null;
    try {
      response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/branches",
        this.options
      );
    } catch (error) {
      this.context.error(error);
      throw error;
    }
    return response.data;
  }
}
