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
export declare class AgentLedger {
    private apiKey;
    private baseUrl;
    private failOpen;
    private timeout;
    private onError?;
    constructor(config: AgentLedgerConfig);
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
    track<T>(options: TrackOptions, fn: () => Promise<T>): Promise<TrackResult<T>>;
    /**
     * Check if an action is allowed without executing it.
     * Useful for pre-flight checks before expensive operations.
     */
    check(options: Pick<TrackOptions, 'agent' | 'service' | 'action'>): Promise<CheckResult>;
    /**
     * Log an action directly without wrapping a function.
     * Useful when you want manual control over timing.
     */
    log(options: TrackOptions & {
        status?: string;
        durationMs?: number;
    }): Promise<{
        id?: string;
    }>;
    /**
     * Pause an agent. All future actions will be blocked until resumed.
     */
    pauseAgent(name: string): Promise<void>;
    /**
     * Resume a paused agent.
     */
    resumeAgent(name: string): Promise<void>;
    /**
     * Kill an agent permanently. All future actions will be blocked.
     */
    killAgent(name: string): Promise<void>;
    private logAction;
    private truncate;
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
    static traceId(): string;
    private fetch;
    private handleError;
}
export default AgentLedger;
