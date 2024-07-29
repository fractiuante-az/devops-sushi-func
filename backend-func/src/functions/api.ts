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

const useLocalCache = true;
let currentTreeSha = undefined;
let currentCommitSha = undefined;

export async function api(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const githubApi = new OctokitApi(
    await octokit_import,
    await octorest_import,
    pat,
    repo,
    owner,
    context
  );

  try {
    if (parseInt((await githubApi.checkRateLimits()).remaining) > 0) {
      if (!currentTreeSha || !currentCommitSha || !useLocalCache) {
        const result = await githubApi.getCurrentCommit();
        currentTreeSha = result.treeSha;
        currentCommitSha = result.commitSha;
      }

      context.error("--Current Tree ---------------");
      context.error(currentCommitSha);
      // createTreeForFolder
      const trees = await githubApi.getTreesForFolder(
        "frontend/public/api",
        currentTreeSha
      );
      context.error(trees);

      const api_folder_sha = trees.filter((item) => {
        return item.folder === "api";
      })[0].folderSha;
      const public_folder_sha = trees.filter((item) => {
        return item.folder === "public";
      })[0].folderSha;
      const frontend_folder_sha = trees.filter((item) => {
        return item.folder === "frontend";
      })[0].folderSha;

      const newTree = await githubApi.addFolderToTree(
        `new_data`,
        api_folder_sha
      );
      //  --> [{path: favicon, mode..  type blob sha....}] API Folder
      // {"sha":"8f2b980aedf0cc3b850d92a57199062efe9469e1",
      // "url":"https://api.github.com/repos/fractiunate-az/devops-sushi-func/git/trees/8f2b980aedf0cc3b850d92a57199062efe9469e1",
      // "tree":[{"path":"favicon.ico","mode":"100644","type":"blob","sha":"df36fcfb72584e00488330b560ebcf34a41c64c2","size":4286,"url":"https://api.github.com/repos/fractiunate-az/devops-sushi-func/git/blobs/df36fcfb72584e00488330b560ebcf34a41c64c2"},{"path":"tf-adapt","mode":"040000","type":"tree","sha":"2a9a5c4176b1d82739c90776ef82785e0133f064","url":"https://api.github.com/repos/fractiunate-az/devops-sushi-func/git/trees/2a9a5c4176b1d82739c90776ef82785e0133f064"}],"truncated":false}

      let newPublicFolderTreeObject = trees.filter((item) => {
        return item.folder === "public";
      })[0];
      newPublicFolderTreeObject.tree.filter((item) => item.path === "api")[0].sha = newTree.sha;
      newPublicFolderTreeObject.tree.filter((item) => item.path === "api")[0].url = newTree.url;
      const public_folder_updated =await githubApi.createTree(newPublicFolderTreeObject.tree, public_folder_sha);
      
      let newFrontendFolderTreeObject = trees.filter((item) => {
        return item.folder === "frontend";
      })[0];
      
      newFrontendFolderTreeObject.tree.filter((item) => item.path === "public")[0].sha = public_folder_updated.sha;
      newFrontendFolderTreeObject.tree.filter((item) => item.path === "public")[0].url = public_folder_updated.url;
      const frontend_folder_updated =await githubApi.createTree(newFrontendFolderTreeObject.tree, frontend_folder_sha);
      
      let newRootFolderTreeObject = trees.filter((item) => {
        return item.folder === "/";
      })[0];

      newRootFolderTreeObject.tree.filter((item) => item.path === "frontend")[0].sha = frontend_folder_updated.sha;
      newRootFolderTreeObject.tree.filter((item) => item.path === "frontend")[0].url = frontend_folder_updated.url;
      const root_folder_tree_updated = await githubApi.createTree(newRootFolderTreeObject.tree, currentTreeSha);
      
      context.error("--Return new root node ---------------");
      context.error(root_folder_tree_updated);
      context.error("--------------------------------------");
      
      var dt = new Date();
      
      const branch_name= `draft/dummy-article-${dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" +dt.getDate()).slice(-2)}`
      await githubApi.commit("Update api tree", root_folder_tree_updated.sha, currentCommitSha, branch_name);

      return {
        body: JSON.stringify({ data: "Success" }),
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
