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
  requiresApproval?: boolean;
  approvalId?: string;
  remainingBudget?: {
    actions?: number;
    costCents?: number;
  };
}

export interface ApprovalRequest {
  id: string;
  org_id: string;
  agent_name: string;
  service: string;
  action: string;
  input: unknown;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  expires_at: string;
  policy_id: string | null;
  metadata: Record<string, unknown>;
  environment: string;
}

export class ApprovalRequiredError extends Error {
  public readonly approvalId: string;

  constructor(approvalId: string, message?: string) {
    super(message || `Approval required (id: ${approvalId})`);
    this.name = 'ApprovalRequiredError';
    this.approvalId = approvalId;
  }
}

export interface ActionLog {
  id: string;
  org_id: string;
  agent_name: string;
  service: string;
  action: string;
  status: string;
  estimated_cost_cents: number;
  duration_ms: number;
  request_meta: Record<string, unknown>;
  trace_id: string | null;
  input: unknown;
  output: unknown;
  environment: string;
  created_at: string;
}

export interface Alert {
  id: string;
  org_id: string;
  agent_id: string;
  agent_name: string;
  alert_type: string;
  severity: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged_at: string | null;
  created_at: string;
}

export interface StreamOptions {
  /** Event types to subscribe to (e.g. ['action.new', 'alert.new']). Default: all */
  events?: string[];
  /** Filter by agent name */
  agent?: string;
  /** Filter by environment */
  environment?: string;
  /** Called when a new action is logged */
  onAction?: (action: ActionLog) => void;
  /** Called when a new alert is created */
  onAlert?: (alert: Alert) => void;
  /** Called on stream errors */
  onError?: (error: Error) => void;
}

export interface StreamHandle {
  /** Close the SSE connection */
  close: () => void;
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
        if (check.requiresApproval && check.approvalId) {
          throw new ApprovalRequiredError(check.approvalId);
        }
        throw new Error(`AgentLedger: Action blocked - ${check.blockReason || 'budget exceeded'}`);
      }
    } catch (err) {
      if (err instanceof ApprovalRequiredError) {
        throw err;
      }
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

  /**
   * Submit an evaluation for a logged action.
   *
   * @example
   * const { actionId } = await ledger.track({ agent: 'bot', service: 'openai', action: 'completion' }, fn);
   * if (actionId) {
   *   await ledger.evaluate(actionId, { score: 85, label: 'good', feedback: 'Fast response' });
   * }
   */
  async evaluate(
    actionId: string,
    options: { score: number; label?: string; feedback?: string; evaluatedBy?: string }
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      action_id: actionId,
      score: options.score,
    };
    if (options.label !== undefined) body.label = options.label;
    if (options.feedback !== undefined) body.feedback = options.feedback;
    if (options.evaluatedBy !== undefined) body.evaluated_by = options.evaluatedBy;

    const res = await this.fetch('/api/v1/evaluations', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`AgentLedger: Failed to create evaluation (${res.status})`);
    }

    const data = await res.json() as { id: string };
    return { id: data.id };
  }

  /**
   * Wait for a human approval decision by polling the approval endpoint.
   * Returns the final status: 'approved', 'denied', or 'expired'.
   *
   * @example
   * const check = await ledger.check({ agent: 'bot', service: 'stripe', action: 'charge' });
   * if (check.requiresApproval && check.approvalId) {
   *   const decision = await ledger.waitForApproval(check.approvalId);
   *   if (decision === 'approved') { // proceed }
   * }
   */
  async waitForApproval(
    approvalId: string,
    options?: { timeout?: number; pollInterval?: number },
  ): Promise<'approved' | 'denied' | 'expired'> {
    const timeout = options?.timeout ?? 300_000; // 5 minutes
    const pollInterval = options?.pollInterval ?? 3_000; // 3 seconds
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const res = await this.fetch(`/api/v1/approvals/${encodeURIComponent(approvalId)}`, {
        method: 'GET',
      });

      if (!res.ok) {
        throw new Error(`AgentLedger: Failed to fetch approval status (${res.status})`);
      }

      const data = (await res.json()) as ApprovalRequest;

      // Check expiration client-side as well
      if (data.status === 'pending' && new Date(data.expires_at) < new Date()) {
        return 'expired';
      }

      if (data.status !== 'pending') {
        return data.status as 'approved' | 'denied' | 'expired';
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return 'expired'; // Timed out waiting
  }

  /**
   * Open an SSE stream to receive real-time action and alert events.
   * Returns a handle with a close() method to terminate the connection.
   *
   * @example
   * const handle = ledger.stream({
   *   agent: 'support-bot',
   *   onAction: (action) => console.log('New action:', action),
   *   onAlert: (alert) => console.log('Alert:', alert),
   *   onError: (err) => console.error('Stream error:', err),
   * });
   * // Later: handle.close();
   */
  stream(options: StreamOptions = {}): StreamHandle {
    const controller = new AbortController();
    let lastEventId = '';

    const connect = () => {
      const params = new URLSearchParams();
      params.set('key', this.apiKey);
      if (options.events && options.events.length > 0) {
        params.set('events', options.events.join(','));
      }
      if (options.agent) {
        params.set('agent', options.agent);
      }
      const env = options.environment || this.environment;
      if (env) {
        params.set('environment', env);
      }

      const url = `${this.baseUrl}/api/v1/stream?${params.toString()}`;
      const headers: Record<string, string> = {};
      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
      }

      fetch(url, {
        signal: controller.signal,
        headers,
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Stream connection failed (${res.status})`);
          }

          const reader = res.body?.getReader();
          if (!reader) {
            throw new Error('No response body for stream');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          const read = (): void => {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  // Connection closed, attempt reconnect
                  if (!controller.signal.aborted) {
                    setTimeout(connect, 3000);
                  }
                  return;
                }

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE messages (split on double newline)
                const parts = buffer.split('\n\n');
                // Keep the last incomplete chunk in the buffer
                buffer = parts.pop() || '';

                for (const part of parts) {
                  if (!part.trim()) continue;

                  let eventType = '';
                  let data = '';
                  let id = '';

                  for (const line of part.split('\n')) {
                    if (line.startsWith('event: ')) {
                      eventType = line.slice(7);
                    } else if (line.startsWith('data: ')) {
                      data = line.slice(6);
                    } else if (line.startsWith('id: ')) {
                      id = line.slice(4);
                    }
                  }

                  if (id) {
                    lastEventId = id;
                  }

                  if (eventType === 'heartbeat') continue;

                  if (data) {
                    try {
                      const parsed = JSON.parse(data);
                      if (eventType === 'action.new' && options.onAction) {
                        options.onAction(parsed as ActionLog);
                      } else if (eventType === 'alert.new' && options.onAlert) {
                        options.onAlert(parsed as Alert);
                      }
                    } catch {
                      // Ignore malformed data
                    }
                  }
                }

                read();
              })
              .catch((err) => {
                if (controller.signal.aborted) return;
                if (options.onError) {
                  options.onError(err instanceof Error ? err : new Error(String(err)));
                }
                // Reconnect after error
                setTimeout(connect, 3000);
              });
          };

          read();
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (options.onError) {
            options.onError(err instanceof Error ? err : new Error(String(err)));
          }
          // Reconnect after error
          setTimeout(connect, 3000);
        });
    };

    connect();

    return {
      close: () => controller.abort(),
    };
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

  /**
   * Log multiple actions in a single request. Ideal for batch imports or high-throughput agents.
   * Max 100 actions per call.
   *
   * @example
   * await ledger.logBatch([
   *   { agent: 'bot', service: 'openai', action: 'completion', costCents: 5 },
   *   { agent: 'bot', service: 'slack', action: 'send_message', costCents: 0 },
   * ]);
   */
  async logBatch(
    actions: (TrackOptions & { status?: string; durationMs?: number })[]
  ): Promise<{ count: number; ids: string[]; errors?: { index: number; error: string }[] }> {
    const payload = actions.map(a => ({
      agent: a.agent,
      service: a.service,
      action: a.action,
      status: a.status || 'success',
      cost_cents: a.costCents || 0,
      duration_ms: a.durationMs || 0,
      metadata: a.metadata || {},
      trace_id: a.traceId,
      input: a.input !== undefined ? this.truncate(a.input, 50000) : undefined,
      output: a.output !== undefined ? this.truncate(a.output, 50000) : undefined,
      environment: this.environment,
    }));

    const res = await this.fetch('/api/v1/actions/batch', {
      method: 'POST',
      body: JSON.stringify({ actions: payload }),
    });

    if (!res.ok) {
      throw new Error(`AgentLedger: Batch log failed (${res.status})`);
    }

    return res.json() as Promise<{ count: number; ids: string[]; errors?: { index: number; error: string }[] }>;
  }

  /**
   * Export action logs as JSON or CSV.
   *
   * @example
   * const data = await ledger.export({ from: '2025-01-01', to: '2025-01-31', format: 'json' });
   */
  async export(options: {
    from: string;
    to: string;
    format?: 'json' | 'csv';
    agent?: string;
    service?: string;
    status?: string;
    limit?: number;
  }): Promise<{ actions: unknown[]; count: number } | string> {
    const params = new URLSearchParams({
      from: options.from,
      to: options.to,
      format: options.format || 'json',
    });
    if (options.agent) params.set('agent', options.agent);
    if (options.service) params.set('service', options.service);
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));

    const res = await this.fetch(`/api/v1/export?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`AgentLedger: Export failed (${res.status})`);
    }

    if (options.format === 'csv') {
      return res.text();
    }
    return res.json() as Promise<{ actions: unknown[]; count: number }>;
  }

  /**
   * Get cost forecasts for all agents.
   *
   * @example
   * const forecast = await ledger.forecast({ daysBack: 30, forecastDays: 30 });
   * console.log(forecast.totalProjectedCostCents);
   */
  async forecast(options?: {
    daysBack?: number;
    forecastDays?: number;
  }): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    if (options?.daysBack) params.set('days_back', String(options.daysBack));
    if (options?.forecastDays) params.set('forecast_days', String(options.forecastDays));
    params.set('environment', this.environment);

    const res = await this.fetch(`/api/v1/forecast?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`AgentLedger: Forecast failed (${res.status})`);
    }

    const data = await res.json() as { forecast: Record<string, unknown> };
    return data.forecast;
  }

  /**
   * Get advanced analytics with multi-day trends.
   *
   * @example
   * const analytics = await ledger.analytics({ days: 30, granularity: 'daily' });
   */
  async analytics(options?: {
    days?: number;
    granularity?: 'daily' | 'hourly';
    agent?: string;
    service?: string;
  }): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    if (options?.days) params.set('days', String(options.days));
    if (options?.granularity) params.set('granularity', options.granularity);
    if (options?.agent) params.set('agent', options.agent);
    if (options?.service) params.set('service', options.service);
    params.set('environment', this.environment);

    const res = await this.fetch(`/api/v1/analytics?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`AgentLedger: Analytics failed (${res.status})`);
    }

    return res.json() as Promise<Record<string, unknown>>;
  }

  /**
   * List available policy templates or apply one.
   *
   * @example
   * const { templates } = await ledger.policyTemplates();
   * await ledger.applyPolicyTemplate('conservative', 'my-agent');
   */
  async policyTemplates(category?: string): Promise<{ templates: Record<string, unknown>[] }> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);

    const res = await this.fetch(`/api/v1/policies/templates?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`AgentLedger: Failed to fetch templates (${res.status})`);
    }

    return res.json() as Promise<{ templates: Record<string, unknown>[] }>;
  }

  /**
   * Apply a policy template to create policies.
   */
  async applyPolicyTemplate(
    templateId: string,
    agentName?: string
  ): Promise<{ policiesCreated: number; policies: Record<string, unknown>[] }> {
    const body: Record<string, unknown> = { template_id: templateId };
    if (agentName) body.agent_name = agentName;

    const res = await this.fetch('/api/v1/policies/templates', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`AgentLedger: Failed to apply template (${res.status})`);
    }

    return res.json() as Promise<{ policiesCreated: number; policies: Record<string, unknown>[] }>;
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
