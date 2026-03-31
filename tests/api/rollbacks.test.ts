import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseChain } from '../setup';
import { createHmac } from 'crypto';

// ---------- mock supabase ----------
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));
// Also mock relative path
vi.mock('../../src/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

// ---------- mock fetch ----------
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ---------- mock crypto.randomUUID ----------
vi.stubGlobal('crypto', {
  ...crypto,
  randomUUID: () => 'test-delivery-uuid',
});

import { fireRollbacks } from '@/lib/rollbacks';

// ---------- helpers ----------
function makeHook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hook_1',
    org_id: 'org_1',
    agent_name: null, // wildcard
    service: null,
    action: null,
    enabled: true,
    rollback_webhook_url: 'https://example.com/rollback',
    rollback_config: { some: 'config' },
    ...overrides,
  };
}

// ---------- tests ----------
describe('fireRollbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });
  });

  it('does nothing when no hooks match', async () => {
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([]));

    await fireRollbacks('org_1', 'agent_killed', 'bot');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('finds matching hooks by agent_name', async () => {
    const hook = makeHook({ agent_name: 'bot' });
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    // Insert execution log
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await fireRollbacks('org_1', 'agent_killed', 'bot');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('matches wildcard hooks (null agent_name)', async () => {
    const hook = makeHook({ agent_name: null });
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await fireRollbacks('org_1', 'agent_killed', 'any-agent');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('skips hooks that target a different agent', async () => {
    const hook = makeHook({ agent_name: 'other-bot' });
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));

    await fireRollbacks('org_1', 'agent_killed', 'bot');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs to webhook URL with correct payload shape', async () => {
    const hook = makeHook();
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await fireRollbacks('org_1', 'budget_exceeded', 'bot');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/rollback',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({
      trigger: 'budget_exceeded',
      agent: 'bot',
      trace_id: null,
      completed_actions: [],
      config: { some: 'config' },
    });
  });

  it('includes trace context when traceId is provided', async () => {
    const hook = makeHook();
    // First call: fetch hooks
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    // Second call: fetch action_logs for trace context
    const traceActions = [
      { id: 'act_1', agent_name: 'bot', service: 'stripe', action: 'charge', status: 'success', estimated_cost_cents: 50, duration_ms: 200, created_at: '2025-01-01T00:00:00Z' },
    ];
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(traceActions));
    // Third call: insert execution log
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await fireRollbacks('org_1', 'agent_killed', 'bot', 'trace_abc');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.trace_id).toBe('trace_abc');
    expect(body.completed_actions).toEqual(traceActions);
  });

  it('includes HMAC signature header', async () => {
    const hook = makeHook({ id: 'hook_42' });
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await fireRollbacks('org_1', 'manual', 'bot');

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-AgentLedger-Rollback-Signature']).toBeDefined();

    // Verify the signature matches expected HMAC
    const body = mockFetch.mock.calls[0][1].body;
    const signingKey = 'rollback_hook_42';
    const expected = createHmac('sha256', signingKey).update(body).digest('hex');
    expect(headers['X-AgentLedger-Rollback-Signature']).toBe(`sha256=${expected}`);
  });

  it('includes trigger reason header', async () => {
    const hook = makeHook();
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await fireRollbacks('org_1', 'agent_killed', 'bot');

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-AgentLedger-Rollback-Trigger']).toBe('agent_killed');
  });

  it('logs execution to rollback_executions', async () => {
    const hook = makeHook();
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    const execChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(execChain);

    await fireRollbacks('org_1', 'manual', 'bot');

    expect(mockFrom).toHaveBeenCalledWith('rollback_executions');
    const insertCall = (execChain as Record<string, any>).insert;
    expect(insertCall).toHaveBeenCalled();

    const logEntry = insertCall.mock.calls[0][0];
    expect(logEntry).toMatchObject({
      rollback_hook_id: 'hook_1',
      org_id: 'org_1',
      trigger_reason: 'manual',
      success: true,
      response_status: 200,
    });
  });

  it('logs failure when webhook returns error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const hook = makeHook();
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    const execChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(execChain);

    await fireRollbacks('org_1', 'manual', 'bot');

    const logEntry = (execChain as Record<string, any>).insert.mock.calls[0][0];
    expect(logEntry.success).toBe(false);
    expect(logEntry.response_status).toBe(500);
  });

  it('logs failure when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const hook = makeHook();
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([hook]));
    const execChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(execChain);

    await fireRollbacks('org_1', 'manual', 'bot');

    const logEntry = (execChain as Record<string, any>).insert.mock.calls[0][0];
    expect(logEntry.success).toBe(false);
    expect(logEntry.response_body).toContain('ECONNREFUSED');
  });
});
