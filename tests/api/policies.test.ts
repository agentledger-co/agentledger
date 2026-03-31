import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseChain } from '../setup';

// ---------- mock supabase ----------
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));
// Also mock the relative import path used in policies.ts
vi.mock('../../src/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

import { evaluatePolicies, invalidatePolicyCache } from '@/lib/policies';

// ---------- helpers ----------
function makePoliciesChain(policies: unknown[]) {
  return createMockSupabaseChain(policies);
}

function makeCountChain(count: number) {
  return createMockSupabaseChain(null, null, count);
}

function makeInsertChain(data: unknown) {
  const chain = createMockSupabaseChain(data);
  return chain;
}

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol_1',
    org_id: 'org_1',
    agent_name: null,
    rule_type: 'service_allowlist',
    rule_config: {},
    enabled: true,
    priority: 10,
    ...overrides,
  };
}

// ---------- tests ----------
describe('evaluatePolicies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePolicyCache('org_1');
  });

  // --- no policies ---
  it('returns allowed:true when there are no policies', async () => {
    mockFrom.mockReturnValue(makePoliciesChain([]));

    const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
    expect(result).toEqual({ allowed: true });
  });

  // --- rate_limit ---
  describe('rate_limit', () => {
    it('blocks when action count exceeds max_actions', async () => {
      const policy = makePolicy({
        rule_type: 'rate_limit',
        rule_config: { max_actions: 5, window_seconds: 60 },
      });

      // First call: fetch policies
      mockFrom.mockReturnValueOnce(makePoliciesChain([policy]));
      // Second call: count query for rate limiting
      mockFrom.mockReturnValueOnce(makeCountChain(6));

      const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain('Rate limit exceeded');
    });

    it('allows when action count is under max_actions', async () => {
      const policy = makePolicy({
        rule_type: 'rate_limit',
        rule_config: { max_actions: 10, window_seconds: 60 },
      });

      mockFrom.mockReturnValueOnce(makePoliciesChain([policy]));
      mockFrom.mockReturnValueOnce(makeCountChain(3));

      const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      expect(result.allowed).toBe(true);
    });

    it('allows when max_actions is 0 (disabled)', async () => {
      const policy = makePolicy({
        rule_type: 'rate_limit',
        rule_config: { max_actions: 0, window_seconds: 60 },
      });

      mockFrom.mockReturnValueOnce(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      expect(result.allowed).toBe(true);
    });
  });

  // --- service_allowlist ---
  describe('service_allowlist', () => {
    it('blocks services not in the allowlist', async () => {
      const policy = makePolicy({
        rule_type: 'service_allowlist',
        rule_config: { services: ['stripe', 'sendgrid'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'slack', 'send');
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain('not in the allowlist');
    });

    it('allows services in the allowlist', async () => {
      const policy = makePolicy({
        rule_type: 'service_allowlist',
        rule_config: { services: ['stripe', 'sendgrid'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      expect(result.allowed).toBe(true);
    });

    it('allows when services list is empty', async () => {
      const policy = makePolicy({
        rule_type: 'service_allowlist',
        rule_config: { services: [] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'anything', 'do');
      expect(result.allowed).toBe(true);
    });
  });

  // --- service_blocklist ---
  describe('service_blocklist', () => {
    it('blocks services in the blocklist', async () => {
      const policy = makePolicy({
        rule_type: 'service_blocklist',
        rule_config: { services: ['danger-api'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'danger-api', 'call');
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain('blocked by policy');
    });

    it('allows services not in the blocklist', async () => {
      const policy = makePolicy({
        rule_type: 'service_blocklist',
        rule_config: { services: ['danger-api'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'safe-api', 'call');
      expect(result.allowed).toBe(true);
    });
  });

  // --- cost_limit_per_action ---
  describe('cost_limit_per_action', () => {
    it('blocks when cost exceeds max', async () => {
      const policy = makePolicy({
        rule_type: 'cost_limit_per_action',
        rule_config: { max_cost_cents: 100 },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'openai', 'generate', 200);
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain('exceeds per-action limit');
    });

    it('allows when cost is under max', async () => {
      const policy = makePolicy({
        rule_type: 'cost_limit_per_action',
        rule_config: { max_cost_cents: 100 },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'openai', 'generate', 50);
      expect(result.allowed).toBe(true);
    });

    it('allows when cost is undefined', async () => {
      const policy = makePolicy({
        rule_type: 'cost_limit_per_action',
        rule_config: { max_cost_cents: 100 },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'openai', 'generate');
      expect(result.allowed).toBe(true);
    });
  });

  // --- payload_regex_block ---
  describe('payload_regex_block', () => {
    it('blocks when input matches a pattern', async () => {
      const policy = makePolicy({
        rule_type: 'payload_regex_block',
        rule_config: { patterns: ['DROP\\s+TABLE', 'DELETE\\s+FROM'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'postgres', 'query', undefined, 'DROP TABLE users');
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain('matches blocked pattern');
    });

    it('allows when input does not match any pattern', async () => {
      const policy = makePolicy({
        rule_type: 'payload_regex_block',
        rule_config: { patterns: ['DROP\\s+TABLE'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'postgres', 'query', undefined, 'SELECT * FROM users');
      expect(result.allowed).toBe(true);
    });

    it('allows when input is null/undefined', async () => {
      const policy = makePolicy({
        rule_type: 'payload_regex_block',
        rule_config: { patterns: ['DROP\\s+TABLE'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'postgres', 'query', undefined, undefined);
      expect(result.allowed).toBe(true);
    });
  });

  // --- require_approval ---
  describe('require_approval', () => {
    it('returns requiresApproval:true with approvalId on success', async () => {
      const policy = makePolicy({
        rule_type: 'require_approval',
        rule_config: {},
      });

      // First call: fetch policies
      mockFrom.mockReturnValueOnce(makePoliciesChain([policy]));
      // Second call: insert approval_request
      mockFrom.mockReturnValueOnce(makeInsertChain({ id: 'apr_123' }));

      const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'refund');
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalId).toBe('apr_123');
      expect(result.policyId).toBe('pol_1');
    });

    it('returns requiresApproval:true without approvalId on insert failure', async () => {
      const policy = makePolicy({
        rule_type: 'require_approval',
        rule_config: {},
      });

      mockFrom.mockReturnValueOnce(makePoliciesChain([policy]));
      mockFrom.mockReturnValueOnce(createMockSupabaseChain(null, { message: 'insert error' }));

      const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'refund');
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalId).toBeUndefined();
    });
  });

  // --- agent_name filtering ---
  describe('agent-specific policies', () => {
    it('applies policy when agent_name matches', async () => {
      const policy = makePolicy({
        agent_name: 'bot',
        rule_type: 'service_blocklist',
        rule_config: { services: ['danger'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'danger', 'call');
      expect(result.allowed).toBe(false);
    });

    it('skips policy when agent_name does not match', async () => {
      const policy = makePolicy({
        agent_name: 'other-bot',
        rule_type: 'service_blocklist',
        rule_config: { services: ['danger'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      const result = await evaluatePolicies('org_1', 'bot', 'danger', 'call');
      expect(result.allowed).toBe(true);
    });
  });

  // --- caching ---
  describe('caching', () => {
    it('uses cached policies within TTL and does not re-query', async () => {
      const policy = makePolicy({
        rule_type: 'service_allowlist',
        rule_config: { services: ['stripe'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      // First call populates cache
      await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      const firstCallCount = mockFrom.mock.calls.length;

      // Second call should use cache
      await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      expect(mockFrom.mock.calls.length).toBe(firstCallCount);
    });

    it('invalidatePolicyCache forces a re-fetch', async () => {
      const policy = makePolicy({
        rule_type: 'service_allowlist',
        rule_config: { services: ['stripe'] },
      });

      mockFrom.mockReturnValue(makePoliciesChain([policy]));

      await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      const firstCallCount = mockFrom.mock.calls.length;

      invalidatePolicyCache('org_1');
      await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
      expect(mockFrom.mock.calls.length).toBeGreaterThan(firstCallCount);
    });
  });

  // --- unknown rule type ---
  it('allows for unknown rule types', async () => {
    const policy = makePolicy({
      rule_type: 'some_future_rule',
      rule_config: {},
    });

    mockFrom.mockReturnValue(makePoliciesChain([policy]));

    const result = await evaluatePolicies('org_1', 'bot', 'stripe', 'charge');
    expect(result.allowed).toBe(true);
  });
});
