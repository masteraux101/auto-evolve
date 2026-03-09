const { exec } = require('child_process');
const axios = require('axios');
const Git = require('../src/services/git');
const GitHub = require('../src/services/github');

// Mock child_process.exec
jest.mock('child_process', () => ({
  exec: jest.fn((command, callback) => {
    if (command.includes('git rev-parse --abbrev-ref HEAD')) {
      callback(null, { stdout: 'test-branch\n', stderr: '' });
    } else {
      callback(null, { stdout: '', stderr: '' });
    }
  }),
}));

// Mock axios
jest.mock('axios');

describe('Git Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    exec.mockClear();
  });

  it('should get the current branch name', async () => {
    const branchName = await Git.getCurrentBranch();
    expect(branchName).toBe('test-branch');
    expect(exec).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', expect.any(Function));
  });

  it('should commit changes with a message', async () => {
    const message = 'feat: new feature';
    await Git.commitChanges(message);
    expect(exec).toHaveBeenCalledWith('git add .', expect.any(Function));
    expect(exec).toHaveBeenCalledWith(`git commit -m "${message}"`, expect.any(Function));
  });

  it('should push changes to a branch', async () => {
    const branchName = 'feature-branch';
    await Git.pushChanges(branchName);
    expect(exec).toHaveBeenCalledWith(`git push origin ${branchName}`, expect.any(Function));
  });

  it('should create a new branch', async () => {
    const branchName = 'new-feature-branch';
    await Git.createBranch(branchName);
    expect(exec).toHaveBeenCalledWith(`git checkout -b ${branchName}`, expect.any(Function));
  });

  it('should get the diff for a branch', async () => {
    const diffOutput = 'diff --git a/file.js b/file.js...';
    exec.mockImplementation((command, callback) => {
      if (command.includes('git diff')) {
        callback(null, { stdout: diffOutput, stderr: '' });
      } else {
        callback(null, { stdout: '', stderr: '' });
      }
    });
    const diff = await Git.getDiff('main');
    expect(diff).toBe(diffOutput);
    expect(exec).toHaveBeenCalledWith('git diff main', expect.any(Function));
  });
});

describe('GitHub Service', () => {
  let github;
  const owner = 'test-owner';
  const repo = 'test-repo';

  beforeEach(() => {
    axios.post.mockClear();
    axios.get.mockClear();
    github = new GitHub('fake-token', owner, repo);
  });

  it('should create a pull request', async () => {
    const prData = {
      title: 'New Feature',
      body: 'This is a new feature.',
      head: 'feature-branch',
      base: 'main',
    };
    const response = { data: { html_url: 'http://github.com/pull/1', number: 1 } };
    axios.post.mockResolvedValue(response);

    const result = await github.createPullRequest(prData.title, prData.body, prData.head, prData.base);

    expect(axios.post).toHaveBeenCalledWith(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      prData,
      expect.any(Object) // for headers
    );
    expect(result).toEqual(response.data);
  });

  it('should get an open pull request for a branch', async () => {
    const head = 'feature-branch';
    const base = 'main';
    const response = { data: [{ number: 1, head: { ref: head } }] };
    axios.get.mockResolvedValue(response);

    const result = await github.getOpenPullRequest(head, base);

    expect(axios.get).toHaveBeenCalledWith(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        params: { head: `${owner}:${head}`, base, state: 'open' },
        headers: expect.any(Object),
      }
    );
    expect(result).toEqual(response.data[0]);
  });
  
  it('should return null if no open pull request is found', async () => {
    const head = 'non-existent-branch';
    const base = 'main';
    const response = { data: [] };
    axios.get.mockResolvedValue(response);

    const result = await github.getOpenPullRequest(head, base);
    expect(result).toBeNull();
  });

  it('should add a comment to a pull request', async () => {
    const prNumber = 42;
    const commentBody = 'This looks great!';
    const response = { data: { id: 123 } };
    axios.post.mockResolvedValue(response);

    await github.addCommentToPR(prNumber, commentBody);

    expect(axios.post).toHaveBeenCalledWith(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { body: commentBody },
      expect.any(Object)
    );
  });
});
