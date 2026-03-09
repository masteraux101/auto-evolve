#!/usr/bin/env python
"""
Entry point for running the py module as a package

Usage: python -m py <command> [options]
"""

import sys
from .main import main

if __name__ == "__main__":
    sys.exit(main() or 0)
