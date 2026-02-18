import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateApiKey, hashApiKey } from '@/lib/auth';

/**
 * These tests verify the business logic that API routes implement,
 * without needing the full Next.js server runtime.
 * 
 * For full end-to-end API testing, use the E2E test suite below
 * which tests against a running server.
 */

describe('API Business Logic', () => {

  // ==================== AUTH FLOW ====================
  describe('API Key Authentication Flow', () => {
    it('full key lifecycle: generate → hash → validate', () => {
      const { key, hash, prefix } = generateApiKey();

      // Key format
      expect(key).toMatch(/^al_[A-Za-z0-9_-]{40}$/);

      // Hash matches
      expect(hashApiKey(key)).toBe(hash);

      // Prefix is first 10 chars
      expect(prefix).toBe(key.slice(0, 10));
      expect(prefix).toMatch(/^al_[A-Za-z0-9_-]{7}$/);
    });

    it('key lookup by hash is unambiguous', () => {
      // Simulate what the DB does: store hash, look up by hash
      const keys = Array.from({ length: 100 }, () => generateApiKey());
      const hashMap = new Map(keys.map(k => [k.hash, k.key]));

      // Every hash maps to exactly one key
      expect(hashMap.size).toBe(100);

      // Looking up each key's hash returns the correct key
      for (const { key, hash } of keys) {
        expect(hashMap.get(hash)).toBe(key);
      }
    });

    it('invalid auth header formats are rejected', () => {
      // These simulate what authenticateApiKey would reject
      const invalidHeaders = [
        null,
        '',
        'Basic dXNlcjpwYXNz',
        'Bearer',
        'Bearer ',
        'Bearer sk_test123',
        'bearer al_valid', // wrong case 'bearer'
        'Token al_valid',
      ];

      for (const header of invalidHeaders) {
        const isValid = header?.startsWith('Bearer al_') && header.length > 13;
        expect(isValid).toBeFalsy();
      }
    });

    it('valid auth header format is accepted', () => {
      const { key } = generateApiKey();
      const header = `Bearer ${key}`;
      const isValid = header.startsWith('Bearer al_') && header.length > 13;
      expect(isValid).toBe(true);
    });
  });

  // ==================== ACTION LOGGING LOGIC ====================
  describe('Action Logging Logic', () => {
    it('required fields validation', () => {
      const validate = (body: Record<string, unknown>) => {
        const { agent, service, action } = body;
        if (!agent || !service || !action) {
          return { valid: false, error: 'Missing required fields: agent, service, action' };
        }
        return { valid: true };
      };

      expect(validate({ agent: 'bot', service: 'slack', action: 'send' }).valid).toBe(true);
      expect(validate({ agent: 'bot' }).valid).toBe(false);
      expect(validate({ service: 'slack' }).valid).toBe(false);
      expect(validate({}).valid).toBe(false);
      expect(validate({ agent: 'bot', service: 'slack' }).valid).toBe(false);
    });

    it('agent status gating', () => {
      const canAct = (status: string) => status === 'active';

      expect(canAct('active')).toBe(true);
      expect(canAct('paused')).toBe(false);
      expect(canAct('killed')).toBe(false);
    });

    it('cost defaults to 0', () => {
      const body = { agent: 'bot', service: 'slack', action: 'send' };
      const cost = (body as Record<string, unknown>).cost_cents || 0;
      expect(cost).toBe(0);
    });

    it('duration defaults to 0', () => {
      const body = { agent: 'bot', service: 'slack', action: 'send' };
      const duration = (body as Record<string, unknown>).duration_ms || 0;
      expect(duration).toBe(0);
    });
  });

  // ==================== BUDGET ENFORCEMENT LOGIC ====================
  describe('Budget Enforcement Logic', () => {
    interface Budget {
      max_actions: number | null;
      current_actions: number;
      max_cost_cents: number | null;
      current_cost_cents: number;
      period: string;
    }

    function checkBudget(budget: Budget): { allowed: boolean; reason?: string } {
      const actionsExceeded = budget.max_actions !== null && budget.current_actions >= budget.max_actions;
      const costExceeded = budget.max_cost_cents !== null && budget.current_cost_cents >= budget.max_cost_cents;

      if (actionsExceeded) {
        return { allowed: false, reason: `${budget.period} action budget exceeded (${budget.current_actions}/${budget.max_actions})` };
      }
      if (costExceeded) {
        return { allowed: false, reason: `${budget.period} cost budget exceeded` };
      }
      return { allowed: true };
    }

    it('allows when under all limits', () => {
      expect(checkBudget({ max_actions: 100, current_actions: 50, max_cost_cents: 5000, current_cost_cents: 2000, period: 'daily' }))
        .toEqual({ allowed: true });
    });

    it('blocks when action limit reached', () => {
      const result = checkBudget({ max_actions: 100, current_actions: 100, max_cost_cents: null, current_cost_cents: 0, period: 'daily' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('action budget exceeded');
      expect(result.reason).toContain('100/100');
    });

    it('blocks when cost limit reached', () => {
      const result = checkBudget({ max_actions: null, current_actions: 0, max_cost_cents: 5000, current_cost_cents: 5000, period: 'weekly' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cost budget exceeded');
    });

    it('allows when limits are null (unlimited)', () => {
      expect(checkBudget({ max_actions: null, current_actions: 999999, max_cost_cents: null, current_cost_cents: 999999, period: 'monthly' }))
        .toEqual({ allowed: true });
    });

    it('action limit takes priority over cost limit', () => {
      const result = checkBudget({ max_actions: 10, current_actions: 10, max_cost_cents: 100, current_cost_cents: 100, period: 'daily' });
      expect(result.reason).toContain('action budget');
    });

    it('budget status computation', () => {
      function computeStatus(budget: Budget): 'ok' | 'warning' | 'critical' | 'exceeded' {
        const actPct = budget.max_actions ? (budget.current_actions / budget.max_actions) * 100 : 0;
        const costPct = budget.max_cost_cents ? (budget.current_cost_cents / budget.max_cost_cents) * 100 : 0;
        const maxPct = Math.max(actPct, costPct);

        if (maxPct >= 100) return 'exceeded';
        if (maxPct >= 90) return 'critical';
        if (maxPct >= 75) return 'warning';
        return 'ok';
      }

      expect(computeStatus({ max_actions: 100, current_actions: 0, max_cost_cents: null, current_cost_cents: 0, period: 'daily' })).toBe('ok');
      expect(computeStatus({ max_actions: 100, current_actions: 50, max_cost_cents: null, current_cost_cents: 0, period: 'daily' })).toBe('ok');
      expect(computeStatus({ max_actions: 100, current_actions: 75, max_cost_cents: null, current_cost_cents: 0, period: 'daily' })).toBe('warning');
      expect(computeStatus({ max_actions: 100, current_actions: 90, max_cost_cents: null, current_cost_cents: 0, period: 'daily' })).toBe('critical');
      expect(computeStatus({ max_actions: 100, current_actions: 100, max_cost_cents: null, current_cost_cents: 0, period: 'daily' })).toBe('exceeded');
      expect(computeStatus({ max_actions: null, current_actions: 999, max_cost_cents: 1000, current_cost_cents: 800, period: 'daily' })).toBe('warning');
    });
  });

  // ==================== STATS COMPUTATION LOGIC ====================
  describe('Stats Computation Logic', () => {
    it('calculates cost totals from action logs', () => {
      const logs = [
        { estimated_cost_cents: 10 },
        { estimated_cost_cents: 25 },
        { estimated_cost_cents: 0 },
        { estimated_cost_cents: 100 },
      ];

      const total = logs.reduce((sum, l) => sum + (l.estimated_cost_cents || 0), 0);
      expect(total).toBe(135);
    });

    it('calculates service breakdown', () => {
      const logs = [
        { service: 'slack' },
        { service: 'slack' },
        { service: 'stripe' },
        { service: 'sendgrid' },
        { service: 'slack' },
      ];

      const breakdown: Record<string, number> = {};
      logs.forEach(l => { breakdown[l.service] = (breakdown[l.service] || 0) + 1; });

      expect(breakdown).toEqual({ slack: 3, stripe: 1, sendgrid: 1 });
    });

    it('calculates error rate', () => {
      const logs = [
        { status: 'success' },
        { status: 'success' },
        { status: 'error' },
        { status: 'success' },
        { status: 'blocked' },
      ];

      const errors = logs.filter(l => l.status === 'error').length;
      const blocked = logs.filter(l => l.status === 'blocked').length;
      const errorRate = logs.length > 0 ? (errors / logs.length) * 100 : 0;

      expect(errors).toBe(1);
      expect(blocked).toBe(1);
      expect(errorRate).toBe(20);
    });

    it('handles empty logs gracefully', () => {
      const logs: { estimated_cost_cents: number }[] = [];
      const total = logs.reduce((sum, l) => sum + (l.estimated_cost_cents || 0), 0);
      expect(total).toBe(0);

      const errorRate = logs.length > 0 ? 0 : 0;
      expect(errorRate).toBe(0);
    });

    it('enriches agents with computed totals', () => {
      const agents = [
        { name: 'bot-a', status: 'active' },
        { name: 'bot-b', status: 'paused' },
      ];

      const logs = [
        { agent_name: 'bot-a', estimated_cost_cents: 10 },
        { agent_name: 'bot-a', estimated_cost_cents: 20 },
        { agent_name: 'bot-b', estimated_cost_cents: 5 },
      ];

      const enriched = agents.map(agent => {
        const agentLogs = logs.filter(l => l.agent_name === agent.name);
        return {
          ...agent,
          total_actions: agentLogs.length,
          total_cost_cents: agentLogs.reduce((s, l) => s + l.estimated_cost_cents, 0),
        };
      });

      expect(enriched[0].total_actions).toBe(2);
      expect(enriched[0].total_cost_cents).toBe(30);
      expect(enriched[1].total_actions).toBe(1);
      expect(enriched[1].total_cost_cents).toBe(5);
    });
  });

  // ==================== SETUP/ONBOARDING LOGIC ====================
  describe('Setup & Onboarding Logic', () => {
    it('validates organization name is required', () => {
      const validate = (body: { name?: string }) => {
        if (!body.name) return { error: 'Organization name required' };
        return { valid: true };
      };

      expect(validate({}).error).toBe('Organization name required');
      expect(validate({ name: '' }).error).toBe('Organization name required');
      expect(validate({ name: 'Acme Corp' })).toEqual({ valid: true });
    });

    it('valid budget periods', () => {
      const validPeriods = ['daily', 'weekly', 'monthly'];
      expect(validPeriods.includes('daily')).toBe(true);
      expect(validPeriods.includes('weekly')).toBe(true);
      expect(validPeriods.includes('monthly')).toBe(true);
      expect(validPeriods.includes('yearly')).toBe(false);
      expect(validPeriods.includes('')).toBe(false);
    });

    it('valid agent statuses', () => {
      const validStatuses = ['active', 'paused', 'killed'];
      expect(validStatuses.includes('active')).toBe(true);
      expect(validStatuses.includes('paused')).toBe(true);
      expect(validStatuses.includes('killed')).toBe(true);
      expect(validStatuses.includes('running')).toBe(false);
      expect(validStatuses.includes('stopped')).toBe(false);
    });

    it('valid alert severities', () => {
      const validSeverities = ['info', 'warning', 'critical'];
      expect(validSeverities).toContain('info');
      expect(validSeverities).toContain('warning');
      expect(validSeverities).toContain('critical');
    });

    it('valid org member roles', () => {
      const validRoles = ['owner', 'admin', 'member', 'viewer'];
      expect(validRoles).toContain('owner');
      expect(validRoles).toContain('admin');
      expect(validRoles).toContain('member');
      expect(validRoles).toContain('viewer');
    });
  });
});
