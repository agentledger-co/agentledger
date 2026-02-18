import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentLedger } from '../../sdk/src/index';

// ==================== MOCK FETCH ====================
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('AgentLedger SDK', () => {
  let ledger: AgentLedger;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new AgentLedger({
      apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      baseUrl: 'http://localhost:3000',
    });
  });

  // ==================== CONSTRUCTOR ====================
  describe('constructor', () => {
    it('creates an instance with valid config', () => {
      expect(ledger).toBeInstanceOf(AgentLedger);
    });

    it('throws on missing API key', () => {
      expect(() => new AgentLedger({ apiKey: '' })).toThrow('Invalid API key');
    });

    it('throws on invalid API key prefix', () => {
      expect(() => new AgentLedger({ apiKey: 'sk_invalid' })).toThrow('Invalid API key');
    });

    it('strips trailing slash from baseUrl', () => {
      const l = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000/',
      });
      // Verify by calling check and inspecting the URL
      mockFetchResponse({ allowed: true });
      l.check({ agent: 'test', service: 's', action: 'a' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/check',
        expect.anything()
      );
    });

    it('defaults baseUrl to https://agentledger.co', () => {
      const l = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      });
      mockFetchResponse({ allowed: true });
      l.check({ agent: 'test', service: 's', action: 'a' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://agentledger.co/api/v1/check',
        expect.anything()
      );
    });
  });

  // ==================== TRACK ====================
  describe('track', () => {
    it('executes the wrapped function and returns its result', async () => {
      // Mock check (pre-flight) and log (post-action) calls
      mockFetchResponse({ allowed: true }); // check
      mockFetchResponse({ logged: true, id: 'action-123' }); // log

      const { result } = await ledger.track(
        { agent: 'bot', service: 'slack', action: 'send' },
        async () => 'hello world'
      );

      expect(result).toBe('hello world');
    });

    it('returns duration and action ID', async () => {
      mockFetchResponse({ allowed: true });
      mockFetchResponse({ logged: true, id: 'action-456' });

      const { durationMs, actionId, allowed } = await ledger.track(
        { agent: 'bot', service: 'slack', action: 'send' },
        async () => {
          await new Promise(r => setTimeout(r, 50));
          return 'ok';
        }
      );

      expect(durationMs).toBeGreaterThanOrEqual(40);
      expect(actionId).toBe('action-456');
      expect(allowed).toBe(true);
    });

    it('sends correct auth header', async () => {
      mockFetchResponse({ allowed: true });
      mockFetchResponse({ logged: true, id: '123' });

      await ledger.track(
        { agent: 'bot', service: 'slack', action: 'send' },
        async () => 'ok'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/check'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer al_testkey1234567890abcdefghijklmnopqrstuv',
          }),
        })
      );
    });

    it('sends correct action data to log endpoint', async () => {
      mockFetchResponse({ allowed: true });
      mockFetchResponse({ logged: true, id: '123' });

      await ledger.track(
        { agent: 'my-bot', service: 'sendgrid', action: 'send_email', costCents: 5, metadata: { to: 'user@test.com' } },
        async () => 'sent'
      );

      // Second call is the log
      const logCall = mockFetch.mock.calls[1];
      const logBody = JSON.parse(logCall[1].body);
      expect(logBody.agent).toBe('my-bot');
      expect(logBody.service).toBe('sendgrid');
      expect(logBody.action).toBe('send_email');
      expect(logBody.cost_cents).toBe(5);
      expect(logBody.status).toBe('success');
      expect(logBody.metadata.to).toBe('user@test.com');
      expect(logBody.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('throws when action is blocked by budget', async () => {
      mockFetchResponse({ allowed: false, blockReason: 'daily budget exceeded' });

      await expect(
        ledger.track(
          { agent: 'bot', service: 'slack', action: 'send' },
          async () => 'should not run'
        )
      ).rejects.toThrow('Action blocked');
    });

    it('logs error status when wrapped function throws', async () => {
      mockFetchResponse({ allowed: true });
      mockFetchResponse({ logged: true, id: '123' }); // error log

      await expect(
        ledger.track(
          { agent: 'bot', service: 'slack', action: 'send' },
          async () => { throw new Error('Slack API down'); }
        )
      ).rejects.toThrow('Slack API down');

      // Verify the log was called with error status
      const logCall = mockFetch.mock.calls[1];
      const logBody = JSON.parse(logCall[1].body);
      expect(logBody.status).toBe('error');
    });

    it('fails open by default when API is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error')); // check fails
      mockFetch.mockRejectedValueOnce(new Error('Network error')); // log fails

      const { result } = await ledger.track(
        { agent: 'bot', service: 'slack', action: 'send' },
        async () => 'still works'
      );

      expect(result).toBe('still works');
    });

    it('fails closed when failOpen is false and API is unreachable', async () => {
      const strictLedger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
        failOpen: false,
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        strictLedger.track(
          { agent: 'bot', service: 'slack', action: 'send' },
          async () => 'should not run'
        )
      ).rejects.toThrow('fail-closed');
    });

    it('calls onError callback on communication failure', async () => {
      const onError = vi.fn();
      const l = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
        onError,
      });

      mockFetch.mockRejectedValueOnce(new Error('timeout')); // check fails
      mockFetch.mockRejectedValueOnce(new Error('timeout')); // log fails

      await l.track(
        { agent: 'bot', service: 'slack', action: 'send' },
        async () => 'ok'
      );

      expect(onError).toHaveBeenCalled();
    });
  });

  // ==================== CHECK ====================
  describe('check', () => {
    it('returns allowed: true when agent is within budget', async () => {
      mockFetchResponse({ allowed: true, remainingBudget: { actions: 50 } });

      const result = await ledger.check({ agent: 'bot', service: 'slack', action: 'send' });
      expect(result.allowed).toBe(true);
    });

    it('returns allowed: false with block reason', async () => {
      mockFetchResponse({ allowed: false, blockReason: 'Agent is paused' });

      const result = await ledger.check({ agent: 'bot', service: 'slack', action: 'send' });
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBe('Agent is paused');
    });

    it('throws on non-200 response', async () => {
      mockFetchResponse({ error: 'Server error' }, 500);

      await expect(
        ledger.check({ agent: 'bot', service: 'slack', action: 'send' })
      ).rejects.toThrow('Check failed');
    });
  });

  // ==================== LOG ====================
  describe('log', () => {
    it('logs an action manually', async () => {
      mockFetchResponse({ logged: true, id: 'manual-123' });

      const result = await ledger.log({
        agent: 'bot',
        service: 'postgres',
        action: 'bulk_insert',
        status: 'success',
        durationMs: 1500,
      });

      expect(result.id).toBe('manual-123');
    });

    it('sends correct payload', async () => {
      mockFetchResponse({ logged: true, id: '123' });

      await ledger.log({
        agent: 'sync',
        service: 'stripe',
        action: 'charge',
        costCents: 250,
        durationMs: 800,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.agent).toBe('sync');
      expect(body.service).toBe('stripe');
      expect(body.action).toBe('charge');
      expect(body.cost_cents).toBe(250);
      expect(body.duration_ms).toBe(800);
    });
  });

  // ==================== AGENT CONTROLS ====================
  describe('agent controls', () => {
    it('pauses an agent', async () => {
      mockFetchResponse({ message: 'Agent paused' });

      await ledger.pauseAgent('support-bot');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/agents/support-bot/pause',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('resumes a paused agent', async () => {
      mockFetchResponse({ message: 'Agent resumed' });

      await ledger.resumeAgent('support-bot');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/agents/support-bot/resume',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('kills an agent', async () => {
      mockFetchResponse({ message: 'Agent killed' });

      await ledger.killAgent('rogue-bot');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/agents/rogue-bot/kill',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on failed pause', async () => {
      mockFetchResponse({ error: 'Not found' }, 404);
      await expect(ledger.pauseAgent('missing')).rejects.toThrow('Failed to pause');
    });

    it('throws on failed resume', async () => {
      mockFetchResponse({ error: 'Not found' }, 404);
      await expect(ledger.resumeAgent('missing')).rejects.toThrow('Failed to resume');
    });

    it('throws on failed kill', async () => {
      mockFetchResponse({ error: 'Not found' }, 404);
      await expect(ledger.killAgent('missing')).rejects.toThrow('Failed to kill');
    });

    it('URL-encodes agent names with special characters', async () => {
      mockFetchResponse({ message: 'ok' });
      await ledger.pauseAgent('agent/with spaces');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('agent%2Fwith%20spaces'),
        expect.anything()
      );
    });
  });

  // ==================== TIMEOUT ====================
  describe('timeout', () => {
    it('respects custom timeout', async () => {
      const l = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
        timeout: 100,
      });

      // Simulate a slow response
      mockFetch.mockImplementationOnce(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 200))
      );

      // Should fail-open (default)
      mockFetch.mockRejectedValueOnce(new Error('timeout')); // log also fails

      const { result } = await l.track(
        { agent: 'bot', service: 's', action: 'a' },
        async () => 'ok'
      );

      expect(result).toBe('ok');
    });
  });
});
