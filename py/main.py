#!/usr/bin/env python
"""
Main entry point for Auto-Evolve Python CLI

Usage:
    python -m py.main run [--task-id ID]
    python -m py.main lint <file>
"""

import argparse
import os
import sys
from dotenv import load_dotenv

def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="Auto-Evolve: AI-powered software evolution.")
    subparsers = parser.add_subparsers(dest="command", help="Available commands", required=True)

    # Run the main planner/worker loop (delegates to node index.js)
    run_parser = subparsers.add_parser("run", help="Run the main planner and worker loop.")
    run_parser.add_argument("--task-id", help="The specific task ID to run.")

    # Lint a Python file
    lint_parser = subparsers.add_parser("lint", help="Run linter and complexity check on a Python file.")
    lint_parser.add_argument("file", help="Path to the Python file to check.")

    args = parser.parse_args()

    if args.command == "run":
        print(f"Running planner/worker for task: {args.task_id or 'next available'}")

        import subprocess
        env = os.environ.copy()
        if args.task_id:
            env['TASK_ID'] = args.task_id

        try:
            result = subprocess.run(
                ['node', 'index.js'],
                cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                capture_output=True,
                text=True,
                timeout=600,
                env=env
            )
            print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            return result.returncode

        except subprocess.TimeoutExpired:
            print("❌ Run timed out after 10 minutes")
            return 1
        except Exception as e:
            print(f"❌ Failed to run planner/worker: {e}")
            return 1

    elif args.command == "lint":
        from .code_tools import run_linter, check_complexity
        import json

        with open(args.file, "r") as f:
            code = f.read()

        lint_result = run_linter(code)
        complexity_result = check_complexity(code)
        print(json.dumps({"linting": lint_result, "complexity": complexity_result}, indent=2))
        return 0 if lint_result.get("passed") else 1

    else:
        parser.print_help()
        return 1

if __name__ == "__main__":
    sys.exit(main() or 0)
