import sys
from pathlib import Path

# Allow running `pytest` from repo root without needing PYTHONPATH=backend
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
