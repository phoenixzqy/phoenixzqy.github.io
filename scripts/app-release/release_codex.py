#!/usr/bin/env python3
"""Check and publish only zai-codex, using the shared release pipeline."""
from release_apps import main as release_main


def main(argv=None):
    return release_main(argv, allowed_apps=('zai-codex',))


if __name__ == '__main__':
    raise SystemExit(main())
