"""OpenAI Agents SDK integration for AgentLedger.

Provides helpers for wrapping async functions and tool executors with
AgentLedger tracking.

Requires the ``openai`` optional dependency::

    pip install agentledger[openai]
"""

from __future__ import annotations

import functools
from typing import Any, Awaitable, Callable, Dict, Optional

from agentledger._async_client import AsyncAgentLedger
from agentledger.types import TrackOptions


def with_agent_ledger(
    ledger: AsyncAgentLedger,
    agent: str,
    service: str,
    action: str,
    fn: Callable[..., Awaitable[Any]],
    *,
    capture_output: bool = False,
    trace_id: Optional[str] = None,
) -> Callable[..., Awaitable[Any]]:
    """Wrap an async function with AgentLedger tracking.

    Example::

        async def call_openai(prompt):
            return await openai.chat.completions.create(...)

        tracked = with_agent_ledger(
            ledger, "my-agent", "openai", "completion", call_openai
        )
        result = await tracked("Hello!")
    """

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        options = TrackOptions(
            agent=agent,
            service=service,
            action=action,
            capture_output=capture_output,
            trace_id=trace_id,
        )
        track_result = await ledger.track(options, lambda: fn(*args, **kwargs))
        return track_result.result

    return wrapper


def create_tool_executor(
    ledger: AsyncAgentLedger,
    agent: str,
    handlers: Dict[str, Callable[..., Awaitable[Any]]],
    service_map: Optional[Dict[str, str]] = None,
) -> Callable[[str, Any], Awaitable[Any]]:
    """Create a tool executor that logs each tool call to AgentLedger.

    Example::

        async def search(query: str) -> str:
            ...

        async def send_email(to: str, body: str) -> str:
            ...

        executor = create_tool_executor(
            ledger,
            agent="my-agent",
            handlers={"search": search, "send_email": send_email},
            service_map={"search": "google", "send_email": "gmail"},
        )

        # In your agent loop:
        result = await executor("search", {"query": "hello"})
    """
    _service_map = service_map or {}

    async def execute(tool_name: str, tool_input: Any = None) -> Any:
        handler = handlers.get(tool_name)
        if handler is None:
            raise ValueError(f"Unknown tool: {tool_name}")

        service = _service_map.get(tool_name, tool_name)
        options = TrackOptions(
            agent=agent,
            service=service,
            action=f"tool:{tool_name}",
            input=tool_input,
            capture_output=True,
        )

        kwargs = tool_input if isinstance(tool_input, dict) else {}
        track_result = await ledger.track(options, lambda: handler(**kwargs))
        return track_result.result

    return execute
