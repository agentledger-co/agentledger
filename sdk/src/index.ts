export interface AgentLedgerConfig {
  /** Your AgentLedger API key (starts with al_) */
  apiKey: string;
  /** Base URL for the AgentLedger API. Default: https://agentledger.co */
  baseUrl?: string;
  /** If true, actions proceed even if AgentLedger is unreachable. Default: true */
  failOpen?: boolean;
  /** Timeout in ms for API calls. Default: 5000 */
  timeout?: number;
  /** Called when an error occurs communicating with AgentLedger */
  onError?: (error: Error) => void;
  /** Environment name (e.g. 'production', 'staging', 'development'). Default: 'production' */
  environment?: string;
}

export interface TrackOptions {
  /** Name of the agent performing the action */
  agent: string;
  /** Service being called (e.g. 'slack', 'stripe', 'openai') */
  service: string;
  /** Action being performed (e.g. 'send_message', 'charge', 'completion') */
  action: string;
  /** Estimated cost in cents. Auto-calculated from duration if not provided. */
  costCents?: number;
  /** Additional metadata to log with the action */
  metadata?: Record<string, unknown>;
  /** Trace ID to group related actions into a session/trace */
  traceId?: string;
  /** Input data sent to the service (e.g. prompt, request body). Stored for debugging. */
  input?: unknown;
  /** If true, automatically capture the return value as output. Default: false */
  captureOutput?: boolean;
  /** Explicit output data to log. Overrides captureOutput. */
  output?: unknown;
}

export interface TrackResult<T> {
  /** The return value of the wrapped function */
  result: T;
  /** Whether AgentLedger allowed the action */
  allowed: boolean;
  /** Duration of the action in milliseconds */
  durationMs: number;
  /** The logged action ID */
  actionId?: string;
}

export interface CheckResult {
  allowed: boolean;
  blockReason?: string;
  remainingBudget?: {
    actions?: number;
    costCents?: number;
  };
}

export class AgentLedger {
  private apiKey: string;
  private baseUrl: string;
  private failOpen: boolean;
  private timeout: number;
  private environment: string;
  private onError?: (error: Error) => void;

  constructor(config: AgentLedgerConfig) {
    if (!config.apiKey || !config.apiKey.startsWith('al_')) {
      throw new Error('AgentLedger: Invalid API key. Keys start with "al_".');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://agentledger.co').replace(/\/$/, '');
    this.failOpen = config.failOpen !== false; // default true
    this.timeout = config.timeout || 5000;
    this.environment = config.environment || 'production';
    this.onError = config.onError;
  }

  /**
   * Track an agent action. Wraps an async function with logging and budget checks.
   * 
   * @example
   * const result = await ledger.track({
   *   agent: 'support-bot',
   *   service: 'slack',
   *   action: 'send_message',
   * }, async () => {
   *   return await slack.chat.postMessage({ channel: '#support', text: 'Hello!' });
   * });
   */
  async track<T>(options: TrackOptions, fn: () => Promise<T>): Promise<TrackResult<T>> {
    // Pre-flight check
    let allowed = true;
    try {
      const check = await this.check(options);
      allowed = check.allowed;
      if (!allowed) {
        throw new Error(`AgentLedger: Action blocked - ${check.blockReason || 'budget exceeded'}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('AgentLedger: Action blocked')) {
        throw err;
      }
      // Communication error — fail open or closed
      if (!this.failOpen) {
        throw new Error('AgentLedger: Cannot verify action (fail-closed mode)');
      }
      this.handleError(err);
    }

    // Execute the action
    const start = Date.now();
    let status = 'success';
    let result: T;

    try {
      result = await fn();
    } catch (err) {
      status = 'error';
      const durationMs = Date.now() - start;
      // Log the error with error details as output
      const errorOutput = err instanceof Error ? { error: err.message, stack: err.stack } : { error: String(err) };
      this.logAction(options, status, durationMs, errorOutput).catch(this.handleError.bind(this));
      throw err;
    }

    const durationMs = Date.now() - start;

    // Capture output if requested
    const capturedOutput = options.captureOutput ? result : undefined;

    // Log the action
    let actionId: string | undefined;
    try {
      const logResult = await this.logAction(options, status, durationMs, capturedOutput);
      actionId = logResult?.id;
    } catch (err) {
      this.handleError(err);
    }

    return { result, allowed, durationMs, actionId };
  }

  /**
   * Check if an action is allowed without executing it.
   * Useful for pre-flight checks before expensive operations.
   */
  async check(options: Pick<TrackOptions, 'agent' | 'service' | 'action'>): Promise<CheckResult> {
    const res = await this.fetch('/api/v1/check', {
      method: 'POST',
      body: JSON.stringify({
        agent: options.agent,
        service: options.service,
        action: options.action,
        environment: this.environment,
      }),
    });

    if (!res.ok) {
      throw new Error(`AgentLedger: Check failed (${res.status})`);
    }

    return res.json() as Promise<CheckResult>;
  }

  /**
   * Log an action directly without wrapping a function.
   * Useful when you want manual control over timing.
   */
  async log(options: TrackOptions & { status?: string; durationMs?: number }): Promise<{ id?: string }> {
    return this.logAction(options, options.status || 'success', options.durationMs || 0);
  }

  /**
   * Pause an agent. All future actions will be blocked until resumed.
   */
  async pauseAgent(name: string): Promise<void> {
    const envParam = `?environment=${encodeURIComponent(this.environment)}`;
    const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/pause${envParam}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`AgentLedger: Failed to pause agent (${res.status})`);
  }

  /**
   * Resume a paused agent.
   */
  async resumeAgent(name: string): Promise<void> {
    const envParam = `?environment=${encodeURIComponent(this.environment)}`;
    const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/resume${envParam}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`AgentLedger: Failed to resume agent (${res.status})`);
  }

  /**
   * Kill an agent permanently. All future actions will be blocked.
   */
  async killAgent(name: string): Promise<void> {
    const envParam = `?environment=${encodeURIComponent(this.environment)}`;
    const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/kill${envParam}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`AgentLedger: Failed to kill agent (${res.status})`);
  }

  // Internal: log action to API
  private async logAction(
    options: TrackOptions,
    status: string,
    durationMs: number,
    capturedOutput?: unknown
  ): Promise<{ id?: string }> {
    // Determine output: explicit > captured > none
    const output = options.output !== undefined ? options.output : capturedOutput;

    const body: Record<string, unknown> = {
      agent: options.agent,
      service: options.service,
      action: options.action,
      status,
      cost_cents: options.costCents || 0,
      duration_ms: durationMs,
      metadata: options.metadata || {},
      environment: this.environment,
    };

    if (options.traceId) body.trace_id = options.traceId;
    if (options.input !== undefined) body.input = this.truncate(options.input, 50000);
    if (output !== undefined) body.output = this.truncate(output, 50000);

    const res = await this.fetch('/api/v1/actions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`AgentLedger: Failed to log action (${res.status})`);
    }

    const data = await res.json() as { id?: string };
    return { id: data.id };
  }

  // Truncate large objects to prevent oversized payloads
  private truncate(data: unknown, maxChars: number): unknown {
    try {
      const json = JSON.stringify(data);
      if (json.length <= maxChars) return data;
      return { _truncated: true, _originalSize: json.length, _preview: json.slice(0, 500) };
    } catch {
      return { _error: 'Could not serialize' };
    }
  }

  /**
   * Generate a unique trace ID for grouping related actions.
   * Call once per "session" or "workflow", then pass to all track() calls.
   * 
   * @example
   * const traceId = AgentLedger.traceId();
   * await ledger.track({ agent: 'bot', service: 'email', action: 'read', traceId }, ...);
   * await ledger.track({ agent: 'bot', service: 'openai', action: 'classify', traceId }, ...);
   * await ledger.track({ agent: 'bot', service: 'email', action: 'reply', traceId }, ...);
   */
  static traceId(): string {
    return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // Internal: fetch with timeout and auth
  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...((init.headers as Record<string, string>) || {}),
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    if (this.onError) {
      this.onError(error);
    }
  }
}

export default AgentLedger;
