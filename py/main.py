#!/usr/bin/env python
"""
Main entry point for Auto-Evolve Python CLI

Usage:
    python -m py.main run [--task-id ID]
    python -m py.main auto-pr -m MESSAGE -t TITLE -b BODY [--branch BRANCH]
"""

import argparse
import os
import sys
from dotenv import load_dotenv

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
        
        # Import the Node.js worker through subprocess
        import subprocess
        import json
        
        # Prepare environment variables for the Node.js process
        env = os.environ.copy()
        if args.task_id:
            env['TASK_ID'] = args.task_id
        
        try:
            # Run the main index.js workflow
            result = subprocess.run(
                ['node', 'index.js'],
                cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
                env=env
            )
            
            print("Planner/Worker Output:")
            print(result.stdout)
            
            if result.stderr:
                print("Errors/Warnings:")
                print(result.stderr)
            
            if result.returncode == 0:
                print("\n✅ Run completed successfully")
                return 0
            else:
                print(f"\n❌ Run failed with exit code {result.returncode}")
                return 1
        
        except subprocess.TimeoutExpired:
            print("❌ Run timed out after 10 minutes")
            return 1
        except Exception as e:
            print(f"❌ Failed to run planner/worker: {e}")
            return 1
    
    elif args.command == "auto-pr":
        print("Triggering automatic pull request feature...")
        
        try:
            from .auto_pr import main as auto_pr_main
            
            # Set environment variables for the auto-pr module
            os.environ['FEATURE_TITLE'] = 'Auto-PR Feature'
            os.environ['FEATURE_DESCRIPTION'] = args.body
            os.environ['TARGET_BRANCH'] = args.branch
            
            result = auto_pr_main()
            
            if result and isinstance(result, dict) and result.get('success'):
                print(f"✅ PR created successfully: {result.get('pr_url')}")
                return 0
            else:
                print("❌ Failed to create pull request")
                return 1
        
        except ImportError as e:
            print(f"❌ Failed to import auto_pr module: {e}")
            return 1
        except Exception as e:
            print(f"❌ Error creating pull request: {e}")
            return 1
    
    else:
        parser.print_help()
        return 1

if __name__ == "__main__":
    sys.exit(main() or 0)
