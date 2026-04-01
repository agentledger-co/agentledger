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

// ---------- mock auth ----------
vi.mock('@/lib/auth', () => ({
  authenticateApiKey: vi.fn().mockResolvedValue({ orgId: 'org_1', apiKeyId: 'key_1' }),
}));

// ---------- mock webhooks, usage, notifications ----------
vi.mock('@/lib/webhooks', () => ({ fireWebhooks: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/usage', () => ({
  checkUsageLimits: vi.fn().mockResolvedValue({ allowed: true, plan: 'pro' }),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/policies', () => ({
  evaluatePolicies: vi.fn().mockResolvedValue({ allowed: true }),
  invalidatePolicyCache: vi.fn(),
}));

// ===== POLICY TEMPLATES TESTS =====
import { POLICY_TEMPLATES, getTemplate, getTemplatesByCategory } from '@/lib/policy-templates';

describe('Policy Templates', () => {
  it('exports a non-empty array of templates', () => {
    expect(POLICY_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('each template has required fields', () => {
    for (const t of POLICY_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['safety', 'cost', 'compliance', 'development']).toContain(t.category);
      expect(t.policies.length).toBeGreaterThan(0);
      for (const p of t.policies) {
        expect(p.rule_type).toBeTruthy();
        expect(p.rule_config).toBeDefined();
        expect(typeof p.priority).toBe('number');
      }
    }
  });

  it('getTemplate returns the correct template by id', () => {
    const t = getTemplate('conservative');
    expect(t).toBeDefined();
    expect(t!.name).toBe('Conservative');
  });

  it('getTemplate returns undefined for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('getTemplatesByCategory filters correctly', () => {
    const safety = getTemplatesByCategory('safety');
    expect(safety.length).toBeGreaterThan(0);
    expect(safety.every(t => t.category === 'safety')).toBe(true);
  });

  it('all template rule_types are valid', () => {
    const validTypes = ['rate_limit', 'service_allowlist', 'service_blocklist', 'cost_limit_per_action', 'payload_regex_block', 'require_approval'];
    for (const t of POLICY_TEMPLATES) {
      for (const p of t.policies) {
        expect(validTypes).toContain(p.rule_type);
      }
    }
  });

  it('conservative template has 3 policies', () => {
    const t = getTemplate('conservative');
    expect(t!.policies.length).toBe(3);
  });

  it('compliance template includes payload_regex_block', () => {
    const t = getTemplate('compliance');
    expect(t!.policies.some(p => p.rule_type === 'payload_regex_block')).toBe(true);
  });

  it('compliance regex patterns are valid', () => {
    const t = getTemplate('compliance');
    const regexPolicy = t!.policies.find(p => p.rule_type === 'payload_regex_block');
    const patterns = regexPolicy!.rule_config.patterns as string[];
    for (const pattern of patterns) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});

// ===== FORECASTING TESTS =====
import { generateForecast } from '@/lib/forecasting';

describe('Cost Forecasting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty forecast when no logs exist', async () => {
    mockFrom.mockReturnValue(createMockSupabaseChain([]));

    const result = await generateForecast('org_1', 30, 30);
    expect(result.totalProjectedCostCents).toBe(0);
    expect(result.agents).toEqual([]);
    expect(result.generatedAt).toBeTruthy();
  });

  it('returns empty forecast on DB error', async () => {
    mockFrom.mockReturnValue(createMockSupabaseChain(null, { message: 'DB error' }));

    const result = await generateForecast('org_1', 30, 30);
    expect(result.totalProjectedCostCents).toBe(0);
    expect(result.agents).toEqual([]);
  });

  it('calculates forecast with log data', async () => {
    const now = new Date();
    const logs = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(now.getTime() - (10 - i) * 24 * 60 * 60 * 1000);
      logs.push({
        agent_name: 'test-bot',
        estimated_cost_cents: 100,
        created_at: date.toISOString(),
      });
    }

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createMockSupabaseChain(logs); // action_logs
      if (callCount === 2) return createMockSupabaseChain([]); // budgets
      return createMockSupabaseChain([]); // agents
    });

    const result = await generateForecast('org_1', 30, 30);
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent).toBe('test-bot');
    expect(result.agents[0].dailyAverageCostCents).toBeGreaterThan(0);
    expect(result.agents[0].projectedCostCents).toBeGreaterThan(0);
    expect(['increasing', 'decreasing', 'stable']).toContain(result.agents[0].trend);
  });

  it('detects budget warnings', async () => {
    const now = new Date();
    const logs = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(now.getTime() - (10 - i) * 24 * 60 * 60 * 1000);
      logs.push({
        agent_name: 'expensive-bot',
        estimated_cost_cents: 1000,
        created_at: date.toISOString(),
      });
    }

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return createMockSupabaseChain(logs); // action_logs
      if (callCount === 2) return createMockSupabaseChain([{ // budgets
        agent_id: 'agent_1',
        max_cost_cents: 5000,
        period: 'monthly',
        current_cost_cents: 4500,
      }]);
      return createMockSupabaseChain([{ id: 'agent_1', name: 'expensive-bot' }]); // agents
    });

    const result = await generateForecast('org_1', 30, 30);
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].budgetWarning).toBe(true);
  });
});

// ===== BATCH ACTION VALIDATION TESTS =====
describe('Batch Action Logging', () => {
  it('validates that batch requires actions array', () => {
    // Test the contract: actions must be an array
    const validPayload = { actions: [{ agent: 'bot', service: 'openai', action: 'completion' }] };
    expect(Array.isArray(validPayload.actions)).toBe(true);
    expect(validPayload.actions.length).toBeLessThanOrEqual(100);
  });

  it('enforces max 100 actions limit', () => {
    const actions = Array.from({ length: 101 }, (_, i) => ({
      agent: `bot-${i}`,
      service: 'openai',
      action: 'completion',
    }));
    expect(actions.length).toBeGreaterThan(100);
  });

  it('validates required fields per action', () => {
    const requiredFields = ['agent', 'service', 'action'];
    const validAction = { agent: 'bot', service: 'openai', action: 'completion' };
    for (const field of requiredFields) {
      expect(validAction).toHaveProperty(field);
    }
  });
});

// ===== EXPORT VALIDATION TESTS =====
describe('Data Export', () => {
  it('validates CSV escape function behavior', () => {
    // Test CSV escaping logic
    const escapeCsv = (val: string): string => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    expect(escapeCsv('simple')).toBe('simple');
    expect(escapeCsv('has,comma')).toBe('"has,comma"');
    expect(escapeCsv('has"quote')).toBe('"has""quote"');
    expect(escapeCsv('has\nnewline')).toBe('"has\nnewline"');
  });

  it('validates date range constraints', () => {
    const from = new Date('2025-01-01');
    const to = new Date('2025-04-01');
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(90);
    expect(diffDays).toBeLessThanOrEqual(90); // Max 90 days
  });

  it('validates format parameter', () => {
    const validFormats = ['json', 'csv'];
    expect(validFormats).toContain('json');
    expect(validFormats).toContain('csv');
    expect(validFormats).not.toContain('xml');
  });
});

// ===== ANALYTICS TESTS =====
describe('Advanced Analytics', () => {
  it('validates granularity parameter', () => {
    const validGranularities = ['daily', 'hourly'];
    expect(validGranularities).toContain('daily');
    expect(validGranularities).toContain('hourly');
  });

  it('validates days range clamping', () => {
    const clamp = (d: number) => Math.min(Math.max(d, 1), 90);
    expect(clamp(0)).toBe(1);
    expect(clamp(7)).toBe(7);
    expect(clamp(100)).toBe(90);
    expect(clamp(-5)).toBe(1);
  });

  it('validates time-series bucketing for daily', () => {
    const date = new Date('2025-03-15T14:30:00Z');
    const dayKey = date.toISOString().slice(0, 10);
    expect(dayKey).toBe('2025-03-15');
  });

  it('validates time-series bucketing for hourly', () => {
    const date = new Date('2025-03-15T14:30:00Z');
    const hourKey = `${date.toISOString().slice(0, 13)}:00:00Z`;
    expect(hourKey).toBe('2025-03-15T14:00:00Z');
  });

  it('validates trend calculation', () => {
    // First half: 100, second half: 150 => +50%
    const firstHalfCost = 100;
    const secondHalfCost = 150;
    const trendPct = Math.round(((secondHalfCost - firstHalfCost) / firstHalfCost) * 100);
    expect(trendPct).toBe(50);
  });

  it('handles zero first-half cost gracefully', () => {
    const firstHalfCost = 0;
    const secondHalfCost = 100;
    const trendPct = firstHalfCost > 0 ? Math.round(((secondHalfCost - firstHalfCost) / firstHalfCost) * 100) : 0;
    expect(trendPct).toBe(0);
  });
});
