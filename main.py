import argparse
import os
from dotenv import load_dotenv
from src.features.auto_pr import create_pull_request

def main():
    """
    Main function to handle command-line arguments and trigger application logic.
    """
    load_dotenv() # Load environment variables from .env file

    parser = argparse.ArgumentParser(description="Auto-Evolve: AI-powered software evolution.")
    subparsers = parser.add_subparsers(dest="command", help="Available commands", required=True)

    # Command for running the main planner/worker loop
    run_parser = subparsers.add_parser("run", help="Run the main planner and worker loop.")
    run_parser.add_argument("--task-id", help="The specific task ID to run.")

    # New command for creating an automatic pull request
    pr_parser = subparsers.add_parser("auto-pr", help="Create an automatic pull request.")
    pr_parser.add_argument("-m", "--commit-message", required=True, help="The commit message for the changes.")
    pr_parser.add_argument("-t", "--title", required=True, help="The title of the pull request.")
    pr_parser.add_argument("-b", "--body", required=True, help="The body content of the pull request.")
    pr_parser.add_argument("--branch", default="dev", help="The source branch with the changes.")


    args = parser.parse_args()

    if args.command == "run":
        print(f"Running planner/worker for task: {args.task_id or 'next available'}")
        # Placeholder for existing application logic
        # from src.main_loop import run_loop
        # run_loop(task_id=args.task_id)
        pass
    elif args.command == "auto-pr":
        print("Triggering automatic pull request feature...")
        repo_full_name = os.getenv("GITHUB_REPOSITORY") # e.g., "masteraux101/auto-evolve"
        base_branch = os.getenv("GITHUB_BASE_BRANCH", "main") # The branch to merge into
        head_branch = args.branch # The branch with the changes

        if not repo_full_name:
            print("Error: GITHUB_REPOSITORY must be set in the environment or .env file.")
            return
        
        repo_owner, repo_name = repo_full_name.split('/')

        try:
            pr_url = create_pull_request(
                repo_owner=repo_owner,
                repo_name=repo_name,
                title=args.title,
                body=args.body,
                head_branch=head_branch,
                base_branch=base_branch,
                commit_message=args.commit_message
            )
            print(f"Successfully created pull request: {pr_url}")
        except Exception as e:
            print(f"Failed to create pull request: {e}")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
