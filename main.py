#!/usr/bin/env python3
"""
Auto-Evolve Main Entry Point

This is a convenience wrapper that delegates to the py module.
Allows running: python main.py <command> [options]

All actual logic is in the py/ package.
"""

import sys
from py.main import main

if __name__ == "__main__":
    sys.exit(main() or 0)
