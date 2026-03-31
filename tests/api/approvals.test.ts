import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseChain } from '../setup';

// ---------- mock supabase ----------
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));
vi.mock('../../src/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

import { evaluatePolicies, invalidatePolicyCache } from '@/lib/policies';

// ---------- helpers ----------
function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol_approval_1',
    org_id: 'org_appr',
    agent_name: null,
    rule_type: 'require_approval',
    rule_config: {},
    enabled: true,
    priority: 10,
    ...overrides,
  };
}

// ---------- tests ----------
describe('approval flow (via evaluatePolicies)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePolicyCache('org_appr');
    invalidatePolicyCache('org_appr2');
    invalidatePolicyCache('org_appr3');
    invalidatePolicyCache('org_appr4');
    invalidatePolicyCache('org_appr5');
  });

  it('creates an approval request when require_approval policy matches', async () => {
    const policy = makePolicy();

    // Fetch policies
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([policy]));
    // Insert approval_request — return the chain with id
    mockFrom.mockReturnValueOnce(createMockSupabaseChain({ id: 'apr_abc' }));

    const result = await evaluatePolicies('org_appr', 'bot', 'stripe', 'refund', undefined, { amount: 500 });

    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);

    // Verify insert was called on approval_requests
    expect(mockFrom).toHaveBeenCalledWith('approval_requests');
  });

  it('returns approvalId in the result', async () => {
    const policy = makePolicy();

    mockFrom.mockReturnValueOnce(createMockSupabaseChain([policy]));
    mockFrom.mockReturnValueOnce(createMockSupabaseChain({ id: 'apr_xyz' }));

    const result = await evaluatePolicies('org_appr2', 'bot', 'stripe', 'refund');

    expect(result.approvalId).toBe('apr_xyz');
    expect(result.policyId).toBe('pol_approval_1');
  });

  it('returns policyId but no approvalId when DB insert fails', async () => {
    const policy = makePolicy();

    mockFrom.mockReturnValueOnce(createMockSupabaseChain([policy]));
    // Insert fails
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null, { message: 'DB error' }));

    const result = await evaluatePolicies('org_appr3', 'bot', 'stripe', 'refund');

    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.policyId).toBe('pol_approval_1');
    expect(result.approvalId).toBeUndefined();
  });

  it('does not create approval when agent_name filter excludes the agent', async () => {
    const policy = makePolicy({ agent_name: 'other-bot' });

    mockFrom.mockReturnValue(createMockSupabaseChain([policy]));

    const result = await evaluatePolicies('org_appr4', 'bot', 'stripe', 'refund');

    // The policy should be skipped because agent_name doesn't match
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBeUndefined();
  });

  it('applies require_approval after passing other policies', async () => {
    const allowlistPolicy = {
      id: 'pol_allow',
      org_id: 'org_appr5',
      agent_name: null,
      rule_type: 'service_allowlist',
      rule_config: { services: ['stripe'] },
      enabled: true,
      priority: 20, // higher priority, evaluated first
    };
    const approvalPolicy = makePolicy({ priority: 10 });

    // Both policies returned
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([allowlistPolicy, approvalPolicy]));
    // Insert approval
    mockFrom.mockReturnValueOnce(createMockSupabaseChain({ id: 'apr_multi' }));

    const result = await evaluatePolicies('org_appr5', 'bot', 'stripe', 'charge');

    // allowlist passes (stripe is allowed), then require_approval triggers
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalId).toBe('apr_multi');
  });

  it('passes environment to the approval request insert', async () => {
    const policy = makePolicy();

    mockFrom.mockReturnValueOnce(createMockSupabaseChain([policy]));
    const insertChain = createMockSupabaseChain({ id: 'apr_env' });
    mockFrom.mockReturnValueOnce(insertChain);

    await evaluatePolicies('org_appr', 'bot', 'stripe', 'refund', undefined, null, 'staging');

    // Verify the insert payload includes environment
    const insertFn = (insertChain as Record<string, any>).insert;
    expect(insertFn).toHaveBeenCalled();
    const payload = insertFn.mock.calls[0][0];
    expect(payload.environment).toBe('staging');
  });

  it('defaults environment to production when not provided', async () => {
    const policy = makePolicy();

    // Use a unique org to avoid cache
    invalidatePolicyCache('org_appr_default');
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([policy]));
    const insertChain = createMockSupabaseChain({ id: 'apr_default' });
    mockFrom.mockReturnValueOnce(insertChain);

    await evaluatePolicies('org_appr_default', 'bot', 'stripe', 'refund');

    const insertFn = (insertChain as Record<string, any>).insert;
    const payload = insertFn.mock.calls[0][0];
    expect(payload.environment).toBe('production');
  });
});
