import dotenv from 'dotenv';

dotenv.config();

const config = {
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.REPO_OWNER || 'masteraux101',
    repo: process.env.REPO_NAME || 'auto-evolve',
  },
};

if (!config.github.token) {
  console.error('FATAL: GITHUB_TOKEN is not set in the environment variables.');
  process.exit(1);
}

export default config;
