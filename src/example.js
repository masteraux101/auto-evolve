const { Octokit } = require("@octokit/rest");
const simpleGit = require("simple-git");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs").promises;
const path = require("path");

/**
 * Main function to orchestrate the creation of a pull request.
 * It handles git operations (branch, add, commit, push) and
 * GitHub API calls (create PR).
 */
async function main() {
    const argv = yargs(hideBin(process.argv))
        .usage("Usage: $0 [options]")
        .option("file-path", {
            type: "string",
            demandOption: true,
            description: "Path of the file to create/update relative to repo root.",
        })
        .option("file-content", {
            type: "string",
            demandOption: true,
            description: "Full content of the file.",
        })
        .option("branch-name", {
            type: "string",
            demandOption: true,
            description: "Name of the new git branch.",
        })
        .option("commit-message", {
            type: "string",
            demandOption: true,
            description: "Commit message for the changes.",
        })
        .option("pr-title", {
            type: "string",
            demandOption: true,
            description: "Title of the pull request.",
        })
        .option("pr-body", {
            type: "string",
            demandOption: true,
            description: "Body/description of the pull request.",
        })
        .option("repo-path", {
            type: "string",
            default: ".",
            description: "Local path to the git repository.",
        })
        .option("repo-name", {
            type: "string",
            description: "GitHub repository name in 'owner/repo' format.",
        })
        .option("base-branch", {
            type: "string",
            default: "main",
            description: "The branch to merge into.",
        })
        .help()
        .argv;

    const repoName = argv.repoName || process.env.GITHUB_REPOSITORY;
    if (!repoName) {
        console.error("Error: Repository name must be provided via --repo-name or GITHUB_REPOSITORY env var.");
        process.exit(1);
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        console.error("Error: GITHUB_TOKEN environment variable is not set.");
        process.exit(1);
    }

    const [owner, repo] = repoName.split('/');
    if (!owner || !repo) {
        console.error("Error: Invalid repository name format. Expected 'owner/repo'.");
        process.exit(1);
    }

    try {
        // Step 1: Handle Git operations
        console.log(`Initializing git in '${argv.repoPath}'...`);
        const git = simpleGit(argv.repoPath);

        console.log(`Creating and checking out new branch '${argv.branchName}'...`);
        await git.checkoutLocalBranch(argv.branchName);

        const fullPath = path.resolve(argv.repoPath, argv.filePath);
        console.log(`Writing content to '${fullPath}'...`);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, argv.fileContent);

        console.log(`Adding '${argv.filePath}' to the index...`);
        await git.add(argv.filePath);

        console.log(`Committing changes with message: \"${argv.commitMessage}\"...`);
        await git.commit(argv.commitMessage);

        console.log(`Pushing branch '${argv.branchName}' to origin...`);
        await git.push("origin", argv.branchName, ["--set-upstream"]);

        // Step 2: Handle GitHub operations
        console.log("Initializing GitHub client...");
        const octokit = new Octokit({ auth: githubToken });

        console.log(`Creating pull request: \"${argv.prTitle}\"...`);
        const { data: pullRequest } = await octokit.pulls.create({
            owner,
            repo,
            title: argv.prTitle,
            body: argv.prBody,
            head: argv.branchName,
            base: argv.baseBranch,
        });

        console.log("\n✅ Successfully created Pull Request!");
        console.log(`  Number: ${pullRequest.number}`);
        console.log(`  URL: ${pullRequest.html_url}`);

    } catch (error) {
        console.error(`\n❌ An error occurred during the workflow:`);
        console.error(error);
        // Note: No automatic cleanup is performed on failure.
        // The local branch will still exist.
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
