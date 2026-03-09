"""
Auto-Evolve Python Module

Python-side code analysis tools for the Worker agent.
GitHub API operations are handled exclusively by core/github-tools.js.
"""

__version__ = "0.1.0"

from .code_tools import run_linter, check_complexity

__all__ = [
    'run_linter',
    'check_complexity',
]
