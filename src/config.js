import fs from 'fs';
import path from 'path';

// Default configuration
const defaultConfig = {
  baseBranch: 'dev',
};

// Load configuration from config.json if it exists
let fileConfig = {};
const configPath = path.resolve(process.cwd(), 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(rawConfig);
  } catch (error) {
    console.warn('Warning: Could not read or parse config.json. Falling back to environment variables.', error);
  }
}

// Combine defaults, file config, and environment variables
const config = {
  repoOwner: fileConfig.repoOwner || process.env.REPO_OWNER,
  repoName: fileConfig.repoName || process.env.REPO_NAME,
  baseBranch: fileConfig.baseBranch || process.env.BASE_BRANCH || defaultConfig.baseBranch,
  githubToken: fileConfig.githubToken || process.env.GITHUB_TOKEN,
};

// If owner/name are not set, try to parse from TARGET_REPOSITORY
if (!config.repoOwner || !config.repoName) {
  const targetRepo = process.env.TARGET_REPOSITORY;
  if (targetRepo && targetRepo.includes('/')) {
    const [owner, name] = targetRepo.split('/');
    config.repoOwner = config.repoOwner || owner;
    config.repoName = config.repoName || name;
  }
}

// Validate required configuration
if (!config.repoOwner || !config.repoName || !config.githubToken) {
  throw new Error(
    'Missing required configuration. Please provide repository owner, name, and GitHub token.\n' +
    'Set them in a `config.json` file or as environment variables (REPO_OWNER, REPO_NAME, GITHUB_TOKEN).'
  );
}

export default config;
