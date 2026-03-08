require('dotenv').config();

const owner = process.env.REPO_OWNER;
const repo = process.env.REPO_NAME;
const token = process.env.GITHUB_TOKEN;
const targetRepository = process.env.TARGET_REPOSITORY;

let repoOwner = owner;
let repoName = repo;

if ((!repoOwner || !repoName) && targetRepository && targetRepository.includes('/')) {
    const [ownerFromTarget, nameFromTarget] = targetRepository.split('/');
    if (!repoOwner) {
        repoOwner = ownerFromTarget;
    }
    if (!repoName) {
        repoName = nameFromTarget;
    }
}

const config = {
  github: {
    owner: repoOwner,
    repo: repoName,
    token: token,
  },
};

// Validate required configuration
const missing = [];
if (!config.github.owner) missing.push('REPO_OWNER or TARGET_REPOSITORY');
if (!config.github.repo) missing.push('REPO_NAME or TARGET_REPOSITORY');
if (!config.github.token) missing.push('GITHUB_TOKEN');

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}

module.exports = config;
