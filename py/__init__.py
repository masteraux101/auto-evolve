"""
Auto-Evolve Python Module

This module contains all Python-based components of the auto-evolve system,
including code analysis, GitHub automation, and PR management.
"""

__version__ = "0.1.0"
__author__ = "Auto-Evolve Team"

from .code_tools import run_linter, check_complexity
from .github_tools import create_pull_request, create_branch, commit_file
from .auto_pr import main as auto_pr_main

__all__ = [
    'run_linter',
    'check_complexity',
    'create_pull_request',
    'create_branch',
    'commit_file',
    'auto_pr_main',
]
