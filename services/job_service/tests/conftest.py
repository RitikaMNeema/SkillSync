import sys
import os

# Ensure both the SkillSync root (for shared/) and the service root (for local packages) are importable
_SKILLSYNC_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_SERVICE_ROOT   = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

for p in (_SKILLSYNC_ROOT, _SERVICE_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)
