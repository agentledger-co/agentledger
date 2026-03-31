"""Synchronous AgentLedger client."""

from __future__ import annotations

import json
import time
import random
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
from urllib.parse import quote

import httpx

from .types import AgentLedgerConfig, CheckResult, TrackOptions, TrackResult

T = TypeVar("T")


class AgentLedger:
    """Synchronous client for the AgentLedger API.

    Example::

        ledger = AgentLedger(AgentLedgerConfig(api_key="al_..."))
        result = ledger.track(
            TrackOptions(agent="support-bot", service="slack", action="send_message"),
            lambda: slack.chat.post_message(channel="#support", text="Hello!"),
        )
    """

    def __init__(self, config: AgentLedgerConfig) -> None:
        if not config.api_key or not config.api_key.startswith("al_"):
            raise ValueError('AgentLedger: Invalid API key. Keys start with "al_".')

        self._api_key = config.api_key
        self._base_url = config.base_url.rstrip("/")
        self._fail_open = config.fail_open
        self._timeout = config.timeout
        self._environment = config.environment
        self._on_error = config.on_error
        self._client = httpx.Client(timeout=self._timeout)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def track(self, options: TrackOptions, fn: Callable[[], T]) -> TrackResult:
        """Track an agent action.

        Performs a pre-flight check, executes *fn*, then logs the result.
        Fails open by default if AgentLedger is unreachable.
        """
        # Pre-flight check
        allowed = True
        try:
            check = self.check(options)
            allowed = check.allowed
            if not allowed:
                reason = check.block_reason or "budget exceeded"
                raise RuntimeError(f"AgentLedger: Action blocked - {reason}")
        except RuntimeError:
            raise
        except Exception as exc:
            if not self._fail_open:
                raise RuntimeError(
                    "AgentLedger: Cannot verify action (fail-closed mode)"
                ) from exc
            self._handle_error(exc)

        # Execute the action
        start = time.monotonic()
        status = "success"
        try:
            result = fn()
        except Exception as exc:
            status = "error"
            duration_ms = int((time.monotonic() - start) * 1000)
            error_output: Dict[str, Any] = {"error": str(exc)}
            if hasattr(exc, "__traceback__"):
                import traceback as _tb

                error_output["stack"] = "".join(
                    _tb.format_exception(type(exc), exc, exc.__traceback__)
                )
            try:
                self._log_action(options, status, duration_ms, error_output)
            except Exception as log_exc:
                self._handle_error(log_exc)
            raise

        duration_ms = int((time.monotonic() - start) * 1000)

        # Capture output if requested
        captured_output = result if options.capture_output else None

        # Log the action
        action_id: Optional[str] = None
        try:
            log_result = self._log_action(options, status, duration_ms, captured_output)
            action_id = log_result.get("id")
        except Exception as exc:
            self._handle_error(exc)

        return TrackResult(
            result=result,
            allowed=allowed,
            duration_ms=duration_ms,
            action_id=action_id,
        )

    def check(
        self, options: Union[TrackOptions, "CheckOptions"]
    ) -> CheckResult:
        """Check if an action is allowed without executing it."""
        data = self._request(
            "POST",
            "/api/v1/check",
            json_body={
                "agent": options.agent,
                "service": options.service,
                "action": options.action,
            },
        )
        return CheckResult(
            allowed=data.get("allowed", True),
            block_reason=data.get("blockReason"),
            remaining_budget=data.get("remainingBudget"),
        )

    def log(
        self,
        options: TrackOptions,
        status: str = "success",
        duration_ms: int = 0,
    ) -> Dict[str, Any]:
        """Log an action directly without wrapping a function."""
        return self._log_action(options, status, duration_ms)

    def pause_agent(self, name: str) -> None:
        """Pause an agent. All future actions will be blocked until resumed."""
        self._request("POST", f"/api/v1/agents/{quote(name, safe='')}/pause")

    def resume_agent(self, name: str) -> None:
        """Resume a paused agent."""
        self._request("POST", f"/api/v1/agents/{quote(name, safe='')}/resume")

    def kill_agent(self, name: str) -> None:
        """Kill an agent permanently. All future actions will be blocked."""
        self._request("POST", f"/api/v1/agents/{quote(name, safe='')}/kill")

    def evaluate(
        self,
        action_id: str,
        score: int,
        label: Optional[str] = None,
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Submit an evaluation for a logged action."""
        body: Dict[str, Any] = {
            "action_id": action_id,
            "score": score,
        }
        if label is not None:
            body["label"] = label
        if feedback is not None:
            body["feedback"] = feedback
        return self._request("POST", "/api/v1/evaluations", json_body=body)

    @staticmethod
    def trace_id() -> str:
        """Generate a unique trace ID for grouping related actions.

        Returns a string in the format ``tr_{base36_timestamp}_{random_8chars}``.
        """
        timestamp_b36 = _int_to_base36(int(time.time() * 1000))
        rand_part = _random_base36(8)
        return f"tr_{timestamp_b36}_{rand_part}"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send an authenticated HTTP request."""
        url = f"{self._base_url}{path}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }
        response = self._client.request(
            method,
            url,
            headers=headers,
            json=json_body,
            params=params,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"AgentLedger: Request failed ({response.status_code})"
            )
        if response.status_code == 204 or not response.content:
            return {}
        return response.json()

    def _log_action(
        self,
        options: TrackOptions,
        status: str,
        duration_ms: int,
        captured_output: Any = None,
    ) -> Dict[str, Any]:
        """Log an action to the API."""
        output = options.output if options.output is not None else captured_output

        body: Dict[str, Any] = {
            "agent": options.agent,
            "service": options.service,
            "action": options.action,
            "status": status,
            "cost_cents": options.cost_cents or 0,
            "duration_ms": duration_ms,
            "metadata": options.metadata or {},
            "environment": self._environment,
        }

        if options.trace_id:
            body["trace_id"] = options.trace_id
        if options.input is not None:
            body["input"] = self._truncate(options.input, 50000)
        if output is not None:
            body["output"] = self._truncate(output, 50000)

        return self._request("POST", "/api/v1/actions", json_body=body)

    @staticmethod
    def _truncate(data: Any, max_chars: int = 50000) -> Any:
        """Truncate large objects to prevent oversized payloads."""
        try:
            serialized = json.dumps(data)
            if len(serialized) <= max_chars:
                return data
            return {
                "_truncated": True,
                "_originalSize": len(serialized),
                "_preview": serialized[:500],
            }
        except (TypeError, ValueError):
            return {"_error": "Could not serialize"}

    def _handle_error(self, exc: Any) -> None:
        """Route errors to the configured callback."""
        error = exc if isinstance(exc, Exception) else Exception(str(exc))
        if self._on_error:
            self._on_error(error)


# Allow check() to accept either TrackOptions or a simple object with the 3 fields
class CheckOptions:
    """Lightweight options for check() calls."""

    __slots__ = ("agent", "service", "action")

    def __init__(self, agent: str, service: str, action: str) -> None:
        self.agent = agent
        self.service = service
        self.action = action


def _int_to_base36(n: int) -> str:
    """Convert a non-negative integer to a base-36 string."""
    if n == 0:
        return "0"
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    parts: List[str] = []
    while n:
        parts.append(chars[n % 36])
        n //= 36
    return "".join(reversed(parts))


def _random_base36(length: int) -> str:
    """Generate *length* random base-36 characters."""
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "".join(random.choice(chars) for _ in range(length))
