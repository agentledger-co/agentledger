"""Type definitions for the AgentLedger Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


@dataclass
class AgentLedgerConfig:
    """Configuration for the AgentLedger client."""

    api_key: str
    base_url: str = "https://agentledger.co"
    fail_open: bool = True
    timeout: float = 5.0
    environment: str = "production"
    on_error: Optional[Callable[[Exception], None]] = None


@dataclass
class TrackOptions:
    """Options for tracking an agent action."""

    agent: str
    service: str
    action: str
    cost_cents: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    trace_id: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    capture_output: bool = False


@dataclass
class TrackResult:
    """Result from a tracked action."""

    result: Any
    allowed: bool
    duration_ms: int
    action_id: Optional[str] = None


@dataclass
class CheckResult:
    """Result from a pre-flight check."""

    allowed: bool
    block_reason: Optional[str] = None
    remaining_budget: Optional[Dict[str, Any]] = None


@dataclass
class LogOptions(TrackOptions):
    """Options for logging an action directly."""

    status: str = "success"
    duration_ms: int = 0
