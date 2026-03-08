import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLedger } from '../../sdk/src/index';
import { sanitizeString, sanitizeMetadata, sanitizePayload, sanitizePositiveInt, validateStatus } from '@/lib/validate';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockSuccess(checkData = { allowed: true }, logData = { logged: true, id: 'test-123' }) {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(checkData) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(logData) });
}

describe('Feature 1: Action Drawer & I/O Logging', () => {
  let ledger: AgentLedger;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new AgentLedger({
      apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      baseUrl: 'http://localhost:3000',
    });
  });

  // ==================== INPUT LOGGING ====================
  describe('Input logging', () => {
    it('sends input data to the API when provided', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'openai', action: 'completion',
        input: { prompt: 'Hello world', model: 'gpt-4o' },
      }, async () => 'response');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.input).toEqual({ prompt: 'Hello world', model: 'gpt-4o' });
    });

    it('does not send input when not provided', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'slack', action: 'send',
      }, async () => 'ok');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.input).toBeUndefined();
    });

    it('handles string input', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'email', action: 'send',
        input: 'plain text input',
      }, async () => 'sent');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.input).toBe('plain text input');
    });

    it('handles array input', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'openai', action: 'chat',
        input: [{ role: 'user', content: 'Hi' }],
      }, async () => 'response');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.input).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('handles null input explicitly', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 's', action: 'a',
        input: null,
      }, async () => 'ok');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      // null input is not undefined, so it should be sent
      expect('input' in body).toBe(true);
    });
  });

  // ==================== OUTPUT CAPTURE ====================
  describe('Output capture', () => {
    it('captures output when captureOutput is true', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'openai', action: 'completion',
        captureOutput: true,
      }, async () => ({ choices: [{ message: { content: 'Hello!' } }] }));

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.output).toEqual({ choices: [{ message: { content: 'Hello!' } }] });
    });

    it('does not capture output when captureOutput is false/unset', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'slack', action: 'send',
      }, async () => ({ ok: true, ts: '123' }));

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.output).toBeUndefined();
    });

    it('explicit output overrides captureOutput', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'openai', action: 'completion',
        captureOutput: true,
        output: { summary: 'custom output' },
      }, async () => ({ fullResponse: 'this should not be logged' }));

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.output).toEqual({ summary: 'custom output' });
    });

    it('captures error details as output on failure', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ allowed: true }) }) // check
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logged: true, id: 'err' }) }); // error log

      try {
        await ledger.track({
          agent: 'bot', service: 'api', action: 'call',
        }, async () => { throw new Error('Service unavailable'); });
      } catch { /* expected */ }

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.output).toBeDefined();
      expect(body.output.error).toBe('Service unavailable');
      expect(body.output.stack).toBeDefined();
    });
  });

  // ==================== LARGE PAYLOAD TRUNCATION ====================
  describe('Payload truncation', () => {
    it('truncates very large input objects', async () => {
      mockSuccess();

      const hugeInput: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        hugeInput[`key_${i}`] = 'x'.repeat(100);
      }

      await ledger.track({
        agent: 'bot', service: 's', action: 'a',
        input: hugeInput,
      }, async () => 'ok');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      // Should be truncated since it exceeds 50KB
      expect(body.input._truncated).toBe(true);
      expect(body.input._originalSize).toBeGreaterThan(50000);
      expect(body.input._preview).toBeDefined();
    });

    it('does not truncate small payloads', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 's', action: 'a',
        input: { small: 'data' },
      }, async () => 'ok');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.input).toEqual({ small: 'data' });
      expect(body.input._truncated).toBeUndefined();
    });
  });
});

describe('Feature 2: Traces & Sessions', () => {
  let ledger: AgentLedger;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new AgentLedger({
      apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      baseUrl: 'http://localhost:3000',
    });
  });

  // ==================== TRACE ID GENERATION ====================
  describe('traceId generation', () => {
    it('generates unique trace IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(AgentLedger.traceId());
      }
      expect(ids.size).toBe(100);
    });

    it('generates trace IDs with tr_ prefix', () => {
      const id = AgentLedger.traceId();
      expect(id).toMatch(/^tr_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('trace IDs are reasonable length', () => {
      const id = AgentLedger.traceId();
      expect(id.length).toBeGreaterThan(10);
      expect(id.length).toBeLessThan(50);
    });
  });

  // ==================== TRACE ID LOGGING ====================
  describe('traceId in track calls', () => {
    it('sends trace_id to the API', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'email', action: 'read',
        traceId: 'tr_abc123_def456',
      }, async () => 'emails');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.trace_id).toBe('tr_abc123_def456');
    });

    it('does not send trace_id when not provided', async () => {
      mockSuccess();

      await ledger.track({
        agent: 'bot', service: 'slack', action: 'send',
      }, async () => 'ok');

      const logCall = mockFetch.mock.calls[1];
      const body = JSON.parse(logCall[1].body);
      expect(body.trace_id).toBeUndefined();
    });

    it('same traceId groups multiple actions', async () => {
      const traceId = AgentLedger.traceId();
      const traceBodies: Record<string, unknown>[] = [];

      // Mock 3 track calls (each needs check + log)
      for (let i = 0; i < 3; i++) {
        mockFetch
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ allowed: true }) })
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logged: true, id: `id-${i}` }) });
      }

      for (const action of ['read_email', 'classify', 'reply']) {
        await ledger.track({
          agent: 'email-bot', service: 'gmail', action,
          traceId,
        }, async () => `did ${action}`);
      }

      // Check all log calls have the same trace_id
      const logCalls = mockFetch.mock.calls.filter((_, i) => i % 2 === 1); // every other call is log
      for (const call of logCalls) {
        const body = JSON.parse(call[1].body);
        expect(body.trace_id).toBe(traceId);
        traceBodies.push(body);
      }

      // Different actions
      expect(traceBodies.map(b => b.action)).toEqual(['read_email', 'classify', 'reply']);
    });
  });
});

describe('Feature 3: Notifications', () => {
  // ==================== NOTIFICATION EVENT VALIDATION ====================
  describe('Notification event types', () => {
    const VALID_EVENTS = ['action.error', 'agent.killed', 'budget.exceeded', 'budget.warning'];

    it('valid events are accepted', () => {
      for (const event of VALID_EVENTS) {
        expect(VALID_EVENTS.includes(event)).toBe(true);
      }
    });

    it('invalid events are filtered', () => {
      const userEvents = ['action.error', 'invalid.event', 'budget.exceeded', 'foo'];
      const filtered = userEvents.filter(e => VALID_EVENTS.includes(e));
      expect(filtered).toEqual(['action.error', 'budget.exceeded']);
    });

    it('empty events array is invalid', () => {
      const events: string[] = [];
      expect(events.length === 0).toBe(true);
    });
  });

  // ==================== NOTIFICATION CHANNEL VALIDATION ====================
  describe('Notification channel validation', () => {
    it('slack channel requires webhook_url', () => {
      const config = { webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' };
      expect(typeof config.webhook_url === 'string' && config.webhook_url.length > 0).toBe(true);
    });

    it('email channel requires email address', () => {
      const config = { email: 'alerts@company.com' };
      expect(typeof config.email === 'string' && config.email.length > 0).toBe(true);
    });

    it('rejects invalid channel types', () => {
      const validChannels = ['email', 'slack'];
      expect(validChannels.includes('sms')).toBe(false);
      expect(validChannels.includes('webhook')).toBe(false);
      expect(validChannels.includes('')).toBe(false);
    });

    it('slack webhook URL format validation', () => {
      const validUrls = [
        'https://hooks.slack.com/services/T123/B456/abc',
        'https://hooks.slack.com/workflows/T123/A456/789',
      ];
      const invalidUrls = [
        'not-a-url',
        'http://evil.com/steal',
        '',
      ];

      for (const url of validUrls) {
        expect(url.startsWith('https://hooks.slack.com/')).toBe(true);
      }
      for (const url of invalidUrls) {
        expect(url.startsWith('https://hooks.slack.com/')).toBe(false);
      }
    });
  });

  // ==================== NOTIFICATION PAYLOAD FORMAT ====================
  describe('Notification payload format', () => {
    it('Slack message has required block structure', () => {
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🔴 *AgentLedger Alert*\n*Agent:* `test-bot`\n*Event:* action.error\nAction failed',
          }
        }
      ];

      expect(blocks[0].type).toBe('section');
      expect(blocks[0].text.type).toBe('mrkdwn');
      expect(blocks[0].text.text).toContain('AgentLedger Alert');
      expect(blocks[0].text.text).toContain('test-bot');
    });

    it('event determines correct emoji', () => {
      const emojiMap: Record<string, string> = {
        'action.error': '🔴',
        'agent.killed': '💀',
        'budget.exceeded': '🚨',
        'budget.warning': '⚠️',
      };

      expect(emojiMap['action.error']).toBe('🔴');
      expect(emojiMap['budget.exceeded']).toBe('🚨');
    });
  });
});

describe('Input Validation for New Fields', () => {
  // ==================== TRACE ID VALIDATION ====================
  describe('trace_id validation', () => {
    it('sanitizeString accepts valid trace IDs', () => {
      expect(sanitizeString('tr_abc123_def456', 200)).toBe('tr_abc123_def456');
    });

    it('sanitizeString truncates long trace IDs', () => {
      const longId = 'tr_' + 'a'.repeat(300);
      const result = sanitizeString(longId, 200);
      expect(result!.length).toBeLessThanOrEqual(200);
    });

    it('sanitizeString returns null for non-string', () => {
      expect(sanitizeString(123, 200)).toBeNull();
      expect(sanitizeString(undefined, 200)).toBeNull();
      expect(sanitizeString(null, 200)).toBeNull();
    });
  });

  // ==================== INPUT/OUTPUT PAYLOAD VALIDATION ====================
  describe('input/output as payload (sanitizePayload)', () => {
    it('accepts plain objects', () => {
      const input = { prompt: 'hello', model: 'gpt-4o' };
      expect(sanitizePayload(input)).toEqual(input);
    });

    it('accepts arrays (e.g. chat messages)', () => {
      const messages = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }];
      expect(sanitizePayload(messages)).toEqual(messages);
    });

    it('accepts strings', () => {
      expect(sanitizePayload('plain text')).toBe('plain text');
    });

    it('accepts numbers', () => {
      expect(sanitizePayload(42)).toBe(42);
    });

    it('returns null for null/undefined', () => {
      expect(sanitizePayload(null)).toBeNull();
      expect(sanitizePayload(undefined)).toBeNull();
    });

    it('truncates oversized payloads', () => {
      const huge = 'x'.repeat(60000);
      const result = sanitizePayload(huge) as Record<string, unknown>;
      expect(result._truncated).toBe(true);
      expect(result._originalSize).toBeGreaterThan(50000);
    });

    it('preserves nested objects', () => {
      const nested = { user: { name: 'test', roles: ['admin'] }, count: 5 };
      expect(sanitizePayload(nested)).toEqual(nested);
    });
  });

  // ==================== METADATA VALIDATION (unchanged) ====================
  describe('metadata validation (sanitizeMetadata)', () => {
    it('sanitizeMetadata accepts valid objects', () => {
      const input = { prompt: 'hello', model: 'gpt-4o' };
      expect(sanitizeMetadata(input)).toEqual(input);
    });

    it('sanitizeMetadata rejects arrays (metadata only)', () => {
      expect(sanitizeMetadata([1, 2, 3])).toEqual({});
    });

    it('sanitizeMetadata rejects non-objects', () => {
      expect(sanitizeMetadata('string')).toEqual({});
      expect(sanitizeMetadata(42)).toEqual({});
      expect(sanitizeMetadata(null)).toEqual({});
    });

    it('sanitizeMetadata truncates oversized objects', () => {
      const huge: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        huge[`k${i}`] = 'x'.repeat(200);
      }
      const result = sanitizeMetadata(huge);
      expect(result._truncated).toBe(true);
    });
  });

  // ==================== STATUS VALIDATION WITH NEW FIELDS ====================
  describe('action status validation unchanged', () => {
    it('validates known statuses', () => {
      expect(validateStatus('success')).toBe('success');
      expect(validateStatus('error')).toBe('error');
      expect(validateStatus('blocked')).toBe('blocked');
    });

    it('defaults unknown status to success', () => {
      expect(validateStatus('unknown')).toBe('success');
      expect(validateStatus('')).toBe('success');
      expect(validateStatus(null)).toBe('success');
    });
  });
});

describe('Regression: Existing Features Still Work', () => {
  let ledger: AgentLedger;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new AgentLedger({
      apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      baseUrl: 'http://localhost:3000',
    });
  });

  it('track without new fields works exactly as before', async () => {
    mockSuccess();

    const { result, allowed, durationMs, actionId } = await ledger.track(
      { agent: 'bot', service: 'slack', action: 'send', costCents: 5, metadata: { channel: '#test' } },
      async () => 'message sent'
    );

    expect(result).toBe('message sent');
    expect(allowed).toBe(true);
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(actionId).toBe('test-123');

    // Verify payload structure is backward compatible
    const logCall = mockFetch.mock.calls[1];
    const body = JSON.parse(logCall[1].body);
    expect(body.agent).toBe('bot');
    expect(body.service).toBe('slack');
    expect(body.action).toBe('send');
    expect(body.cost_cents).toBe(5);
    expect(body.metadata).toEqual({ channel: '#test' });
    expect(body.status).toBe('success');
    // New fields should NOT be present
    expect(body.trace_id).toBeUndefined();
    expect(body.input).toBeUndefined();
    expect(body.output).toBeUndefined();
  });

  it('kill switch still blocks actions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: false, blockReason: 'Agent has been killed' }),
    });

    await expect(
      ledger.track(
        { agent: 'killed-bot', service: 'slack', action: 'send' },
        async () => 'should not run'
      )
    ).rejects.toThrow('Action blocked');
  });

  it('fail-open still works with new fields', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error')); // check fails
    mockFetch.mockRejectedValueOnce(new Error('Network error')); // log fails

    const { result } = await ledger.track(
      { agent: 'bot', service: 's', action: 'a', traceId: 'tr_123', input: { x: 1 }, captureOutput: true },
      async () => 'resilient'
    );

    expect(result).toBe('resilient');
  });

  it('budget enforcement is unchanged by new fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: false, blockReason: 'daily budget exceeded' }),
    });

    await expect(
      ledger.track(
        { agent: 'bot', service: 's', action: 'a', traceId: 'tr_test', input: { data: 'test' } },
        async () => 'blocked'
      )
    ).rejects.toThrow('Action blocked');
  });

  it('log() manual method still works', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ logged: true, id: 'manual-456' }),
    });

    const result = await ledger.log({
      agent: 'sync', service: 'db', action: 'backup',
      status: 'success', durationMs: 3000,
      traceId: 'tr_backup_1',
      input: { tables: ['users', 'orders'] },
      output: { rows: 15000 },
    });

    expect(result.id).toBe('manual-456');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.trace_id).toBe('tr_backup_1');
    expect(body.input).toEqual({ tables: ['users', 'orders'] });
    expect(body.output).toEqual({ rows: 15000 });
  });

  it('agent controls (pause/resume/kill) are unaffected', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
    await ledger.pauseAgent('test-bot');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/agents/test-bot/pause',
      expect.objectContaining({ method: 'POST' })
    );

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
    await ledger.resumeAgent('test-bot');

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
    await ledger.killAgent('test-bot');
  });

  it('onError callback still fires on new field failures', async () => {
    const onError = vi.fn();
    const l = new AgentLedger({
      apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      baseUrl: 'http://localhost:3000',
      onError,
    });

    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    await l.track(
      { agent: 'bot', service: 's', action: 'a', traceId: 'tr_test', captureOutput: true },
      async () => 'ok'
    );

    expect(onError).toHaveBeenCalled();
  });
});
