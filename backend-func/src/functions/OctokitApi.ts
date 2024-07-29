import { InvocationContext } from "@azure/functions/types/InvocationContext";
import path from "path";
import { readFile } from "fs-extra";

export default class OctokitApi {
  [x: string]: any;
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
      ...this.options,
      name,
      auto_init: true,
    });
  }

  async getTree(tree_sha: string) {
    const result = await this.octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        ...this.options,
        tree_sha,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    return result.data.tree;
  }

  // add all files in <folder> to new tree. After that add the subtree to the current tree and add the new tree to the.
  async getTreesForFolder(folderPath: string, treeSha: string) {
    const folderPathArr = folderPath.split("/");
    let folderSha = treeSha;
    let tree = await this.getTree(folderSha);
    let result = [
      {
        folder: '/',
        folderSha,
        tree,
      }
    ];

    for (var i = 0; i < folderPathArr.length; i++) {
      folderSha = this.getFolderTreeSha(tree, folderPathArr[i]);
      tree = await this.getTree(folderSha);
      result.push({
        folder: folderPathArr[i],
        folderSha,
        tree,
      })
    }
    return result;
  }
  async addFolderToTree(folderPath: string, treeSha: string) {
    return await (async () => {
      const { globbySync } = await import("globby");
      const filesPaths = await globbySync(folderPath, { gitignore: true });
      const filesBlobs = await Promise.all(
        filesPaths.map(this.createBlobForFile())
      );
      const pathsForBlobs = filesPaths.map((fullPath) =>
        path.relative(folderPath, fullPath).replace(/\\/g, "/")
      );
      if (filesBlobs.length === 0) {
        this.context.error(`No files found in ${folderPath}`);
        throw new Error(`Can not create tree. No files found in ${folderPath}`);
      }
      const newTree = await this.createNewTreeFromFiles(
        filesBlobs,
        pathsForBlobs,
        treeSha
      );
      return newTree;
    })();
  }
  getFolderTreeSha(tree, folderName) {
    try {
      return tree.filter((item) => item.path === folderName)[0].sha;
    } catch (error) {
      this.context.error(`Folder ${folderName} not found in ${tree.tree}`);
      throw new Error(`Folder ${folderName} not found in ${tree.tree}`);
    }
  }

  async uploadToRepo(coursePath: string, branch: string = "main") {
    // gets commit's AND its tree's SHA
    const currentCommit = await this.getCurrentCommit(branch);
    await (async () => {
      const { globby, globbySync } = await import("globby");
      const filesPaths = await globbySync(coursePath, { gitignore: true });

      this.context.error(filesPaths);
      const filesBlobs = await Promise.all(
        filesPaths.map(this.createBlobForFile())
      );

      const pathsForBlobs = filesPaths.map((fullPath) =>
        path.relative(coursePath, fullPath).replace(/\\/g, "/")
      );
      const newTree = await this.createNewTreeFromFiles(
        filesBlobs,
        pathsForBlobs,
        currentCommit.treeSha
      );
      this.context.error(newTree);
      this.commit(
        "Add new files",
        newTree.sha,
        currentCommit.commitSha,
        branch
      );
    })();
  }

  async commit(
    commitMessage: string,
    newTreeSha: string,
    currentCommitSha: string,
    branch: string = "main"
  ) {
    const newCommit = await this.createNewCommit(
      commitMessage,
      newTreeSha,
      currentCommitSha
    );
    try {
      if (branch !== "main") {
        await this.createBranch(branch, newCommit.sha);
      }
    } catch (error) {
      this.context.error(`Branch probably exists error ${error}`);
    }
    return await this.setBranchToCommit(branch, newCommit.sha);
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
      tree: commitData.tree,
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

  createNewTreeFromFiles = async (
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
    return await this.createTree(tree, parentTreeSha);
  };

  createTree = async (tree: any, parentTreeSha: string) => {
    const { data } = await this.octoRest.git.createTree({
      ...this.options,
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

  setBranchToCommit = (branch: string = `main`, commitSha: string, force: boolean = false) =>
    this.octoRest.git.updateRef({
      owner: this.options.owner,
      force,
      repo: this.options.repo,
      ref: `heads/${branch}`,
      sha: commitSha,
    });

  // async commitFile(content: string) {
  //   let response = await this.octoRest.commitFile({
  //     ...this.options,
  //     message: "Add new file",
  //     content,
  //   });
  // }

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
