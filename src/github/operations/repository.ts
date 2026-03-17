import { z } from "zod";
import { githubRequest } from "../common/utils.js";
import { GitHubRepositorySchema, GitHubSearchResponseSchema } from "../common/types.js";

// Schema definitions
export const CreateRepositoryOptionsSchema = z.object({
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Whether the repository should be private"),
  autoInit: z.boolean().optional().describe("Initialize with README.md"),
});

export const SearchRepositoriesSchema = z.object({
  query: z.string().describe("Search query (see GitHub search syntax)"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)"),
});

export const ForkRepositorySchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  organization: z.string().optional().describe("Optional: organization to fork to (defaults to your personal account)"),
});

export const DeleteAllRepositoriesSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  confirm: z.boolean().describe("Confirmation that you want to delete all repositories (must be true)"),
});

// Type exports
export type CreateRepositoryOptions = z.infer<typeof CreateRepositoryOptionsSchema>;

// Function implementations
export async function createRepository(options: CreateRepositoryOptions) {
  const response = await githubRequest("https://api.github.com/user/repos", {
    method: "POST",
    body: options,
  });
  return GitHubRepositorySchema.parse(response);
}

export async function searchRepositories(
  query: string,
  page: number = 1,
  perPage: number = 30
) {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.append("q", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await githubRequest(url.toString());
  return GitHubSearchResponseSchema.parse(response);
}

export async function deleteAllRepositories(
  owner: string,
  confirm: boolean
): Promise<{ deleted: string[]; errors: { repo: string; error: string }[] }> {
  if (!confirm) {
    throw new Error("Confirmation required: set confirm to true to delete all repositories");
  }

  const deleted: string[] = [];
  const errors: { repo: string; error: string }[] = [];

  let page = 1;
  const repos: string[] = [];

  // Collect all repos (try user endpoint, fall back to org endpoint)
  while (true) {
    const url = new URL(`https://api.github.com/users/${owner}/repos`);
    url.searchParams.append("per_page", "100");
    url.searchParams.append("page", page.toString());
    url.searchParams.append("type", "owner");

    const response = (await githubRequest(url.toString())) as Array<{ name: string }>;
    if (!Array.isArray(response) || response.length === 0) break;

    for (const repo of response) {
      repos.push(repo.name);
    }

    if (response.length < 100) break;
    page++;
  }

  // Delete each repo
  for (const repoName of repos) {
    try {
      await githubRequest(`https://api.github.com/repos/${owner}/${repoName}`, {
        method: "DELETE",
      });
      deleted.push(repoName);
    } catch (err) {
      errors.push({
        repo: repoName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { deleted, errors };
}

export async function forkRepository(
  owner: string,
  repo: string,
  organization?: string
) {
  const url = organization
    ? `https://api.github.com/repos/${owner}/${repo}/forks?organization=${organization}`
    : `https://api.github.com/repos/${owner}/${repo}/forks`;

  const response = await githubRequest(url, { method: "POST" });
  return GitHubRepositorySchema.extend({
    parent: GitHubRepositorySchema,
    source: GitHubRepositorySchema,
  }).parse(response);
}
