export class AgentLedger {
    constructor(config) {
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
    async track(options, fn) {
        // Pre-flight check
        let allowed = true;
        try {
            const check = await this.check(options);
            allowed = check.allowed;
            if (!allowed) {
                throw new Error(`AgentLedger: Action blocked - ${check.blockReason || 'budget exceeded'}`);
            }
        }
        catch (err) {
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
        let result;
        try {
            result = await fn();
        }
        catch (err) {
            status = 'error';
            const durationMs = Date.now() - start;
            // Log the error, then re-throw
            this.logAction(options, status, durationMs).catch(this.handleError.bind(this));
            throw err;
        }
        const durationMs = Date.now() - start;
        // Log the action (fire and forget for speed, unless we need the ID)
        let actionId;
        try {
            const logResult = await this.logAction(options, status, durationMs);
            actionId = logResult?.id;
        }
        catch (err) {
            this.handleError(err);
        }
        return { result, allowed, durationMs, actionId };
    }
    /**
     * Check if an action is allowed without executing it.
     * Useful for pre-flight checks before expensive operations.
     */
    async check(options) {
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
        return res.json();
    }
    /**
     * Log an action directly without wrapping a function.
     * Useful when you want manual control over timing.
     */
    async log(options) {
        return this.logAction(options, options.status || 'success', options.durationMs || 0);
    }
    /**
     * Pause an agent. All future actions will be blocked until resumed.
     */
    async pauseAgent(name) {
        const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/pause`, {
            method: 'POST',
        });
        if (!res.ok)
            throw new Error(`AgentLedger: Failed to pause agent (${res.status})`);
    }
    /**
     * Resume a paused agent.
     */
    async resumeAgent(name) {
        const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/resume`, {
            method: 'POST',
        });
        if (!res.ok)
            throw new Error(`AgentLedger: Failed to resume agent (${res.status})`);
    }
    /**
     * Kill an agent permanently. All future actions will be blocked.
     */
    async killAgent(name) {
        const res = await this.fetch(`/api/v1/agents/${encodeURIComponent(name)}/kill`, {
            method: 'POST',
        });
        if (!res.ok)
            throw new Error(`AgentLedger: Failed to kill agent (${res.status})`);
    }
    // Internal: log action to API
    async logAction(options, status, durationMs) {
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
        const data = await res.json();
        return { id: data.id };
    }
    // Internal: fetch with timeout and auth
    async fetch(path, init = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            return await fetch(`${this.baseUrl}${path}`, {
                ...init,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                    ...(init.headers || {}),
                },
            });
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    handleError(err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.onError) {
            this.onError(error);
        }
    }
}
export default AgentLedger;
