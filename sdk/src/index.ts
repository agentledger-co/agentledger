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
  private onError?: (error: Error) => void;

  constructor(config: AgentLedgerConfig) {
    if (!config.apiKey || !config.apiKey.startsWith('al_')) {
      throw new Error('AgentLedger: Invalid API key. Keys start with "al_".');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://agentledger.co').replace(/\/$/, '');
    this.failOpen = config.failOpen !== false; // default true
    this.timeout = config.timeout || 5000;
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
      // Log the error, then re-throw
      this.logAction(options, status, durationMs).catch(this.handleError.bind(this));
      throw err;
    }

    const durationMs = Date.now() - start;

    // Log the action (fire and forget for speed, unless we need the ID)
    let actionId: string | undefined;
    try {
      const logResult = await this.logAction(options, status, durationMs);
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
    const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/pause`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`AgentLedger: Failed to pause agent (${res.status})`);
  }

  /**
   * Resume a paused agent.
   */
  async resumeAgent(name: string): Promise<void> {
    const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/resume`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`AgentLedger: Failed to resume agent (${res.status})`);
  }

  /**
   * Kill an agent permanently. All future actions will be blocked.
   */
  async killAgent(name: string): Promise<void> {
    const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/kill`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`AgentLedger: Failed to kill agent (${res.status})`);
  }

  // Internal: log action to API
  private async logAction(
    options: TrackOptions,
    status: string,
    durationMs: number
  ): Promise<{ id?: string }> {
    const res = await this.fetch('/api/v1/actions', {
      method: 'POST',
      body: JSON.stringify({
        agent: options.agent,
        service: options.service,
        action: options.action,
        status,
        cost_cents: options.costCents || 0,
        duration_ms: durationMs,
        metadata: options.metadata || {},
      }),
    });

    if (!res.ok) {
      throw new Error(`AgentLedger: Failed to log action (${res.status})`);
    }

    const data = await res.json() as { id?: string };
    return { id: data.id };
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
