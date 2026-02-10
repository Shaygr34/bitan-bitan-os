"""
IDOM→SUMIT Sync Engine
Synchronizes SHAAM/IDOM tax authority data with SUMIT accounting platform.

Supports:
- Financial Reports (דוחות כספיים) - Companies/Trusts
- Annual Reports (דוחות שנתיים) - Individuals
"""

from .config import (
    ReportType,
    ReportConfig,
    get_config,
    STATUS_COMPLETED,
)

from .idom_parser import (
    IDOMParser,
    parse_idom_file,
)

from .sumit_parser import (
    SUMITParser,
    parse_sumit_file,
)

from .sync_engine import (
    SyncEngine,
    SyncResult,
    run_sync,
)

from .output_writer import (
    OutputWriter,
    write_outputs,
)

from .validation import (
    ValidationResult,
    run_preflight_validation,
    validate_idom_file,
    validate_sumit_file,
)

__version__ = "1.1.0"
__all__ = [
    'ReportType',
    'ReportConfig', 
    'get_config',
    'IDOMParser',
    'parse_idom_file',
    'SUMITParser',
    'parse_sumit_file',
    'SyncEngine',
    'SyncResult',
    'run_sync',
    'OutputWriter',
    'write_outputs',
    'ValidationResult',
    'run_preflight_validation',
    'validate_idom_file',
    'validate_sumit_file',
]
