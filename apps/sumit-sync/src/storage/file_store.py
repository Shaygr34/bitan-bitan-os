"""
File storage abstraction.

v1 uses Railway Volume (simple filesystem).
Swap to R2/S3 later by changing this module only.
"""

import os
import shutil
from pathlib import Path
from typing import Optional

# Base directory — Railway Volume mount point, fallback to local dir for dev
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def uploads_dir(run_id: str) -> Path:
    """Directory for a run's uploaded input files."""
    return _ensure_dir(DATA_DIR / "uploads" / run_id)


def outputs_dir(run_id: str) -> Path:
    """Directory for a run's generated output files."""
    return _ensure_dir(DATA_DIR / "outputs" / run_id)


def store_upload(run_id: str, filename: str, content: bytes) -> Path:
    """Persist an uploaded file and return the stored path."""
    dest = uploads_dir(run_id) / filename
    dest.write_bytes(content)
    return dest


def read_file(path: str) -> Optional[bytes]:
    """Read a stored file by path. Returns None if missing."""
    p = Path(path)
    if p.exists():
        return p.read_bytes()
    return None


def volume_writable() -> bool:
    """Health check — can we write to the data volume?"""
    probe = DATA_DIR / ".probe"
    try:
        _ensure_dir(DATA_DIR)
        probe.write_text("ok")
        probe.unlink()
        return True
    except OSError:
        return False
