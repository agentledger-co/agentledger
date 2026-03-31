"""LangChain integration for AgentLedger.

Provides a callback handler that automatically logs LLM and tool
calls to AgentLedger.

Requires the ``langchain`` optional dependency::

    pip install agentledger-py[langchain]
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Sequence, Union
from uuid import UUID

try:
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.agents import AgentAction, AgentFinish
    from langchain_core.messages import BaseMessage
    from langchain_core.outputs import LLMResult

    _HAS_LANGCHAIN = True
except ImportError:
    _HAS_LANGCHAIN = False

if not _HAS_LANGCHAIN:

    class AgentLedgerCallbackHandler:  # type: ignore[no-redef]
        """Stub that raises on instantiation when langchain is not installed."""

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            raise ImportError(
                "langchain-core is required for the LangChain integration. "
                "Install it with: pip install agentledger-py[langchain]"
            )

else:
    from agentledger.client import AgentLedger
    from agentledger.types import TrackOptions

    class AgentLedgerCallbackHandler(BaseCallbackHandler):  # type: ignore[no-redef]
        """LangChain callback handler that logs tool and LLM calls to AgentLedger."""

        def __init__(
            self,
            ledger: AgentLedger,
            agent: str,
            service_map: Optional[Dict[str, str]] = None,
            track_llm: bool = True,
            track_tools: bool = True,
        ) -> None:
            self.ledger = ledger
            self.agent = agent
            self.service_map = service_map or {}
            self.track_llm = track_llm
            self.track_tools = track_tools
            self._run_starts: Dict[UUID, float] = {}

        # ---- Tool callbacks ----

        def on_tool_start(
            self,
            serialized: Dict[str, Any],
            input_str: str,
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            tags: Optional[List[str]] = None,
            metadata: Optional[Dict[str, Any]] = None,
            inputs: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            if self.track_tools:
                self._run_starts[run_id] = time.monotonic()

        def on_tool_end(
            self,
            output: Any,
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            **kwargs: Any,
        ) -> None:
            if not self.track_tools:
                return
            duration_ms = self._duration(run_id)
            tool_name = kwargs.get("name", "unknown_tool")
            service = self.service_map.get(tool_name, "langchain")
            try:
                self.ledger.log(
                    TrackOptions(
                        agent=self.agent,
                        service=service,
                        action=f"tool:{tool_name}",
                        output=str(output)[:1000],
                    ),
                    status="success",
                    duration_ms=duration_ms,
                )
            except Exception:
                pass

        def on_tool_error(
            self,
            error: BaseException,
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            **kwargs: Any,
        ) -> None:
            if not self.track_tools:
                return
            duration_ms = self._duration(run_id)
            tool_name = kwargs.get("name", "unknown_tool")
            service = self.service_map.get(tool_name, "langchain")
            try:
                self.ledger.log(
                    TrackOptions(
                        agent=self.agent,
                        service=service,
                        action=f"tool:{tool_name}",
                        output={"error": str(error)},
                    ),
                    status="error",
                    duration_ms=duration_ms,
                )
            except Exception:
                pass

        # ---- LLM callbacks ----

        def on_llm_start(
            self,
            serialized: Dict[str, Any],
            prompts: List[str],
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            tags: Optional[List[str]] = None,
            metadata: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            if self.track_llm:
                self._run_starts[run_id] = time.monotonic()

        def on_llm_end(
            self,
            response: LLMResult,
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            **kwargs: Any,
        ) -> None:
            if not self.track_llm:
                return
            duration_ms = self._duration(run_id)
            model = (
                response.llm_output.get("model_name", "unknown")
                if response.llm_output
                else "unknown"
            )
            service = self.service_map.get("llm", "openai")
            try:
                self.ledger.log(
                    TrackOptions(
                        agent=self.agent,
                        service=service,
                        action=f"llm:{model}",
                        metadata={
                            "model": model,
                            "generations": len(response.generations),
                        },
                    ),
                    status="success",
                    duration_ms=duration_ms,
                )
            except Exception:
                pass

        def on_llm_error(
            self,
            error: BaseException,
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            **kwargs: Any,
        ) -> None:
            if not self.track_llm:
                return
            duration_ms = self._duration(run_id)
            service = self.service_map.get("llm", "openai")
            try:
                self.ledger.log(
                    TrackOptions(
                        agent=self.agent,
                        service=service,
                        action="llm:error",
                        output={"error": str(error)},
                    ),
                    status="error",
                    duration_ms=duration_ms,
                )
            except Exception:
                pass

        # Required stubs for BaseCallbackHandler
        def on_chat_model_start(
            self,
            serialized: Dict[str, Any],
            messages: List[List[BaseMessage]],
            *,
            run_id: UUID,
            parent_run_id: Optional[UUID] = None,
            tags: Optional[List[str]] = None,
            metadata: Optional[Dict[str, Any]] = None,
            **kwargs: Any,
        ) -> None:
            if self.track_llm:
                self._run_starts[run_id] = time.monotonic()

        # ---- Helpers ----

        def _duration(self, run_id: UUID) -> int:
            start = self._run_starts.pop(run_id, None)
            if start is None:
                return 0
            return int((time.monotonic() - start) * 1000)
