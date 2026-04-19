import sys
import os

# Repository root (for shared/) and service root (for local packages) must be importable.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_SERVICE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

for p in (_REPO_ROOT, _SERVICE_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)
