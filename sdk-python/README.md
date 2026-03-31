# AgentLedger Python SDK

Python SDK for [AgentLedger](https://agentledger.co) - AI agent observability, budget management, and guardrails.

## Installation

```bash
pip install agentledger
```

With optional integrations:

```bash
pip install agentledger[langchain]   # LangChain callback handler
pip install agentledger[openai]      # OpenAI Agents helpers
```

## Quick Start

```python
from agentledger import AgentLedger, AgentLedgerConfig, TrackOptions

ledger = AgentLedger(AgentLedgerConfig(api_key="al_your_key"))

# Track an action with automatic pre-flight check and logging
result = ledger.track(
    TrackOptions(agent="support-bot", service="slack", action="send_message"),
    lambda: slack.chat.post_message(channel="#support", text="Hello!"),
)

print(result.result)       # Return value from your function
print(result.allowed)      # True if AgentLedger allowed the action
print(result.duration_ms)  # How long the action took
print(result.action_id)    # ID of the logged action
```

## Async Usage

```python
from agentledger import AsyncAgentLedger, AgentLedgerConfig, TrackOptions

ledger = AsyncAgentLedger(AgentLedgerConfig(api_key="al_your_key"))

result = await ledger.track(
    TrackOptions(agent="support-bot", service="openai", action="completion"),
    lambda: openai.chat.completions.create(model="gpt-4", messages=[...]),
)
```

## Trace IDs

Group related actions into a single trace:

```python
trace_id = AgentLedger.trace_id()

ledger.track(
    TrackOptions(agent="bot", service="email", action="read", trace_id=trace_id),
    lambda: read_emails(),
)
ledger.track(
    TrackOptions(agent="bot", service="openai", action="classify", trace_id=trace_id),
    lambda: classify_email(email),
)
```

## Pre-flight Checks

Check if an action is allowed before executing:

```python
check = ledger.check(TrackOptions(agent="bot", service="stripe", action="charge"))
if check.allowed:
    charge_customer()
else:
    print(f"Blocked: {check.block_reason}")
```

## Agent Control

```python
ledger.pause_agent("support-bot")   # Pause - blocks all future actions
ledger.resume_agent("support-bot")  # Resume
ledger.kill_agent("support-bot")    # Kill permanently
```

## Manual Logging

```python
ledger.log(
    TrackOptions(
        agent="bot",
        service="openai",
        action="completion",
        cost_cents=5,
        metadata={"model": "gpt-4", "tokens": 150},
    ),
    status="success",
    duration_ms=1200,
)
```

## Evaluations

```python
ledger.evaluate(
    action_id="act_123",
    score=1,
    label="correct",
    feedback="Response was accurate and helpful",
)
```

## LangChain Integration

```python
from agentledger import AgentLedger, AgentLedgerConfig
from agentledger.integrations.langchain import AgentLedgerCallbackHandler

ledger = AgentLedger(AgentLedgerConfig(api_key="al_your_key"))

handler = AgentLedgerCallbackHandler(
    ledger=ledger,
    agent="my-langchain-agent",
    service_map={"llm": "openai", "search": "google"},
)

# Pass as callback to any LangChain component
chain.invoke({"input": "Hello"}, config={"callbacks": [handler]})
```

## OpenAI Agents Integration

```python
from agentledger import AsyncAgentLedger, AgentLedgerConfig
from agentledger.integrations.openai_agents import with_agent_ledger, create_tool_executor

ledger = AsyncAgentLedger(AgentLedgerConfig(api_key="al_your_key"))

# Wrap a single function
tracked_fn = with_agent_ledger(ledger, "my-agent", "openai", "completion", call_openai)
result = await tracked_fn(prompt="Hello!")

# Or create a tool executor for multiple tools
executor = create_tool_executor(
    ledger,
    agent="my-agent",
    handlers={"search": search_fn, "send_email": email_fn},
    service_map={"search": "google", "send_email": "gmail"},
)
result = await executor("search", {"query": "hello"})
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `api_key` | (required) | API key starting with `al_` |
| `base_url` | `https://agentledger.co` | API base URL |
| `fail_open` | `True` | Allow actions if AgentLedger is unreachable |
| `timeout` | `5.0` | HTTP timeout in seconds |
| `environment` | `production` | Environment tag for all actions |
| `on_error` | `None` | Error callback function |
