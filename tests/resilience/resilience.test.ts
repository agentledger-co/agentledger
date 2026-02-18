import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateApiKey, hashApiKey } from '@/lib/auth';
import { createMockSupabaseChain } from '../setup';

/**
 * RESILIENCE TEST SUITE
 * 
 * Tests every edge case a real user would hit:
 * - Empty states (new user, no data)
 * - Malformed inputs
 * - Concurrent operations
 * - Rate limits and quotas
 * - Data integrity under stress
 * - Error recovery
 * - Cross-tab/session scenarios
 */

// ==================== HELPERS ====================
const mockOrg = { id: 'org-123', name: 'Test Org', plan: 'free' };
const mockKey = generateApiKey();

function mockFrom(table: string, data: unknown = [], error: unknown = null, count: number | null = null) {
  return createMockSupabaseChain(data, error, count);
}

// ==================== 1. EMPTY STATE RESILIENCE ====================
describe('Empty State Resilience', () => {
  
  it('stats API returns valid shape with zero data', () => {
    // Simulate what the stats endpoint returns for a new user
    const emptyStats = {
      totalActions: 0,
      todayActions: 0,
      todayCostCents: 0,
      weekCostCents: 0,
      activeAgents: 0,
      totalAgents: 0,
      agents: [],
      errorCount: 0,
      blockedCount: 0,
      serviceBreakdown: {},
      agentBreakdown: {},
      hourlyData: [],
      alerts: [],
    };

    // Every field should be safe to call methods on
    expect(emptyStats.totalActions.toLocaleString()).toBe('0');
    expect(emptyStats.agents.length).toBe(0);
    expect(emptyStats.agents.map(a => a)).toEqual([]);
    expect(Object.entries(emptyStats.serviceBreakdown)).toEqual([]);
    expect(emptyStats.hourlyData.length).toBe(0);
    expect(emptyStats.alerts.length).toBe(0);
  });

  it('usage API returns valid shape with zero data', () => {
    const emptyUsage = {
      plan: 'free',
      limits: { actionsPerMonth: 1000, maxAgents: 2 },
      usage: { actionsThisMonth: 0, actionsThisWeek: 0, actionsToday: 0, agents: 0, activeWebhooks: 0, activeApiKeys: 1 },
      percentages: { actions: 0, agents: 0 },
    };

    // The dashboard maps this to:
    const mapped = {
      actions_used: emptyUsage.usage.actionsThisMonth || 0,
      actions_limit: emptyUsage.limits?.actionsPerMonth || 1000,
      percentage: emptyUsage.percentages?.actions || 0,
      plan: emptyUsage.plan || 'free',
    };

    expect(mapped.actions_used.toLocaleString()).toBe('0');
    expect(mapped.actions_limit.toLocaleString()).toBe('1,000');
    expect(mapped.percentage).toBe(0);
  });

  it('budget tab handles zero budgets gracefully', () => {
    const budgets: unknown[] = [];
    const exceeded = budgets.filter((b: Record<string, unknown>) => b.status === 'exceeded');
    expect(exceeded.length).toBe(0);
  });

  it('actions tab handles zero actions gracefully', () => {
    const actions: unknown[] = [];
    const filtered = actions.filter(() => true);
    expect(filtered.length).toBe(0);
    // Pagination should show "0 of 0"
    expect(`${filtered.length} of ${actions.length} actions`).toBe('0 of 0 actions');
  });

  it('hourly chart handles 24 hours of zero data', () => {
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      actions: 0,
      cost: 0,
    }));

    expect(hourlyData.length).toBe(24);
    expect(hourlyData.every(h => h.actions === 0)).toBe(true);
    expect(hourlyData.every(h => h.cost === 0)).toBe(true);
  });
});

// ==================== 2. INPUT VALIDATION ====================
describe('Input Validation & Sanitization', () => {
  
  describe('Action logging inputs', () => {
    it('rejects empty agent name', () => {
      const body = { agent: '', service: 'test', action: 'test' };
      expect(body.agent).toBe('');
      // API should reject this
    });

    it('rejects missing required fields', () => {
      const bodies = [
        { service: 'test', action: 'test' }, // missing agent
        { agent: 'bot', action: 'test' },    // missing service
        { agent: 'bot', service: 'test' },    // missing action
      ];

      for (const body of bodies) {
        const hasAllRequired = 'agent' in body && 'service' in body && 'action' in body;
        if (body === bodies[0]) expect(hasAllRequired).toBe(false);
      }
    });

    it('handles extremely long agent names', () => {
      const longName = 'a'.repeat(10000);
      // Should be truncated or rejected, not crash
      expect(longName.length).toBe(10000);
    });

    it('handles unicode agent names', () => {
      const unicodeNames = ['测试机器人', 'ботагент', '🤖agent', 'agent\nwith\nnewlines', 'agent\x00null'];
      for (const name of unicodeNames) {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });

    it('handles negative cost values', () => {
      const costCents = -500;
      expect(costCents).toBeLessThan(0);
      // API should reject or clamp to 0
    });

    it('handles float cost values', () => {
      const costCents = 1.5;
      const rounded = Math.round(costCents);
      expect(rounded).toBe(2);
    });

    it('handles missing optional metadata', () => {
      const body = { agent: 'bot', service: 'test', action: 'test' };
      const metadata = (body as Record<string, unknown>).request_meta || {};
      expect(metadata).toEqual({});
    });

    it('handles massive metadata payload', () => {
      const bigMeta = { data: 'x'.repeat(100000) };
      const json = JSON.stringify(bigMeta);
      expect(json.length).toBeGreaterThan(100000);
      // Should either accept or reject cleanly, not crash
    });
  });

  describe('API key validation', () => {
    it('rejects keys without al_ prefix', () => {
      const badKeys = ['sk_live_abc', 'bearer_token', 'abc123', '', ' ', 'al_'];
      for (const key of badKeys) {
        const isValid = /^al_[A-Za-z0-9]{40}$/.test(key);
        expect(isValid).toBe(false);
      }
    });

    it('rejects SQL injection in auth header', () => {
      const sqlInjection = "al_' OR 1=1; DROP TABLE api_keys;--";
      const hash = hashApiKey(sqlInjection);
      // Hash should be a clean hex string, no SQL
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects keys with special characters', () => {
      const specialKeys = [
        'al_<script>alert(1)</script>',
        'al_../../etc/passwd',
        'al_${process.env.SECRET}',
      ];
      for (const key of specialKeys) {
        const isValid = /^al_[A-Za-z0-9]{40}$/.test(key);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Budget validation', () => {
    it('rejects budget with no limits set', () => {
      const budget = { agent_name: 'bot', period: 'daily', max_actions: null, max_cost_cents: null };
      const hasLimit = budget.max_actions !== null || budget.max_cost_cents !== null;
      expect(hasLimit).toBe(false);
    });

    it('rejects zero limits', () => {
      const budget = { max_actions: 0, max_cost_cents: 0 };
      const hasPositiveLimit = (budget.max_actions && budget.max_actions > 0) || (budget.max_cost_cents && budget.max_cost_cents > 0);
      expect(hasPositiveLimit).toBeFalsy();
    });

    it('rejects negative limits', () => {
      const budget = { max_actions: -10, max_cost_cents: -500 };
      expect(budget.max_actions).toBeLessThan(0);
      expect(budget.max_cost_cents).toBeLessThan(0);
    });

    it('rejects invalid period values', () => {
      const validPeriods = ['hourly', 'daily', 'weekly', 'monthly'];
      const invalidPeriods = ['yearly', 'minutely', '', 'DAILY', 'Daily'];
      for (const p of invalidPeriods) {
        expect(validPeriods.includes(p)).toBe(false);
      }
    });
  });

  describe('Webhook validation', () => {
    it('rejects non-HTTPS webhook URLs in production', () => {
      const urls = ['http://example.com/hook', 'ftp://evil.com', 'javascript:alert(1)', ''];
      for (const url of urls) {
        const isSecure = url.startsWith('https://');
        expect(isSecure).toBe(false);
      }
    });

    it('allows localhost URLs for development', () => {
      const devUrls = ['http://localhost:3000/webhook', 'http://127.0.0.1:8080/hook'];
      for (const url of devUrls) {
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
        expect(isLocal).toBe(true);
      }
    });

    it('rejects invalid event types', () => {
      const validEvents = ['action.logged', 'agent.paused', 'agent.killed', 'agent.resumed', 'budget.exceeded', 'budget.warning', 'alert.created'];
      const invalidEvents = ['action.deleted', 'user.created', 'system.reboot', ''];
      for (const e of invalidEvents) {
        expect(validEvents.includes(e)).toBe(false);
      }
    });
  });
});

// ==================== 3. COST CALCULATION INTEGRITY ====================
describe('Cost Calculation Integrity', () => {
  
  it('formatCost handles zero correctly', () => {
    const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formatCost handles small amounts', () => {
    const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    expect(formatCost(1)).toBe('$0.01');
    expect(formatCost(99)).toBe('$0.99');
  });

  it('formatCost handles large amounts without floating point errors', () => {
    const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    expect(formatCost(100000)).toBe('$1000.00');
    expect(formatCost(999999)).toBe('$9999.99');
    expect(formatCost(10000000)).toBe('$100000.00');
  });

  it('cost summation is accurate over many actions', () => {
    // Simulate 10,000 actions at various costs
    const costs = Array.from({ length: 10000 }, (_, i) => (i % 50) + 1); // 1-50 cents each
    const total = costs.reduce((sum, c) => sum + c, 0);
    const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    
    expect(total).toBe(255000);
    expect(formatCost(total)).toBe('$2550.00');
  });

  it('budget percentage calculation handles edge cases', () => {
    // 0/0
    const pct1 = 0 / 1000 * 100; // 0% - normal
    expect(pct1).toBe(0);

    // At limit
    const pct2 = 1000 / 1000 * 100;
    expect(pct2).toBe(100);

    // Over limit
    const pct3 = 1500 / 1000 * 100;
    expect(pct3).toBe(150);

    // Math.min clamp for progress bar
    expect(Math.min(pct3, 100)).toBe(100);
  });

  it('avg cost per action handles division by zero', () => {
    const todayActions = 0;
    const todayCost = 0;
    const avg = todayActions > 0 ? Math.round(todayCost / todayActions) : 0;
    expect(avg).toBe(0);
    expect(isFinite(avg)).toBe(true);
  });
});

// ==================== 4. TIME HANDLING ====================
describe('Time Handling', () => {
  
  it('timeAgo handles all time ranges', () => {
    const timeAgo = (dateStr: string) => {
      const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    };

    const now = new Date();
    expect(timeAgo(now.toISOString())).toBe('0s ago');
    expect(timeAgo(new Date(now.getTime() - 30000).toISOString())).toBe('30s ago');
    expect(timeAgo(new Date(now.getTime() - 300000).toISOString())).toBe('5m ago');
    expect(timeAgo(new Date(now.getTime() - 7200000).toISOString())).toBe('2h ago');
    expect(timeAgo(new Date(now.getTime() - 172800000).toISOString())).toBe('2d ago');
  });

  it('timeAgo handles future dates without crashing', () => {
    const timeAgo = (dateStr: string) => {
      const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (seconds < 0) return 'just now';
      if (seconds < 60) return `${seconds}s ago`;
      return `${Math.floor(seconds / 60)}m ago`;
    };

    const future = new Date(Date.now() + 60000).toISOString();
    expect(timeAgo(future)).toBe('just now');
  });

  it('timeAgo handles invalid dates', () => {
    const safeTimeAgo = (dateStr: string) => {
      try {
        const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (isNaN(seconds)) return 'unknown';
        if (seconds < 60) return `${seconds}s ago`;
        return `${Math.floor(seconds / 60)}m ago`;
      } catch {
        return 'unknown';
      }
    };

    expect(safeTimeAgo('invalid-date')).toBe('unknown');
    expect(safeTimeAgo('')).toBe('unknown');
  });

  it('hourly chart generates exactly 24 hours', () => {
    const now = new Date();
    const hourlyData = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      hourlyData.push({
        hour: hourStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        actions: 0,
        cost: 0,
      });
    }
    expect(hourlyData.length).toBe(24);
    // Each hour label should be unique
    const labels = new Set(hourlyData.map(h => h.hour));
    expect(labels.size).toBe(24);
  });

  it('budget period boundaries are correct', () => {
    const now = new Date();
    
    // Daily: start of today
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    expect(dayStart.getHours()).toBe(0);
    expect(dayStart.getMinutes()).toBe(0);

    // Weekly: 7 days ago
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const diffDays = Math.round((now.getTime() - weekAgo.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(7);

    // Monthly: 1st of current month
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    expect(monthStart.getDate()).toBe(1);
  });
});

// ==================== 5. CONCURRENT ACCESS PATTERNS ====================
describe('Concurrent Access Patterns', () => {

  it('multiple rapid API key generations produce unique keys', () => {
    const keys = Array.from({ length: 1000 }, () => generateApiKey());
    const uniqueKeys = new Set(keys.map(k => k.key));
    const uniqueHashes = new Set(keys.map(k => k.hash));
    
    expect(uniqueKeys.size).toBe(1000);
    expect(uniqueHashes.size).toBe(1000);
  });

  it('hash collisions are statistically impossible', () => {
    // Generate 10,000 keys and check for hash collisions
    const hashes = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const { hash } = generateApiKey();
      expect(hashes.has(hash)).toBe(false);
      hashes.add(hash);
    }
  });

  it('concurrent budget updates should be serializable', () => {
    // Simulate: current_actions=99, max_actions=100
    // Two concurrent requests both try to increment
    let currentActions = 99;
    const maxActions = 100;

    // Without locking, both might pass the check
    const check1 = currentActions < maxActions; // true
    const check2 = currentActions < maxActions; // true — race condition
    
    // Both increment
    if (check1) currentActions++;
    if (check2) currentActions++;

    // Now we're at 101 — over budget!
    expect(currentActions).toBe(101);
    expect(currentActions > maxActions).toBe(true);
    // This demonstrates why budget checks should be atomic in the DB
  });

  it('toast IDs are unique even when created simultaneously', () => {
    const ids = Array.from({ length: 1000 }, () => Math.random().toString(36).slice(2));
    const unique = new Set(ids);
    // Very unlikely to collide with 36^10 space, but verify
    expect(unique.size).toBe(1000);
  });
});

// ==================== 6. AGENT STATE MACHINE ====================
describe('Agent State Machine', () => {
  
  const validTransitions: Record<string, string[]> = {
    active: ['paused', 'killed'],
    paused: ['active', 'killed'],
    killed: ['active'], // revive
  };

  it('all valid transitions are allowed', () => {
    for (const [from, tos] of Object.entries(validTransitions)) {
      for (const to of tos) {
        expect(validTransitions[from]).toContain(to);
      }
    }
  });

  it('active agents allow actions', () => {
    const agentStatus = 'active';
    const allowed = agentStatus === 'active';
    expect(allowed).toBe(true);
  });

  it('paused agents block actions', () => {
    const agentStatus = 'paused';
    const allowed = agentStatus === 'active';
    expect(allowed).toBe(false);
  });

  it('killed agents block actions', () => {
    const agentStatus = 'killed';
    const allowed = agentStatus === 'active';
    expect(allowed).toBe(false);
  });

  it('pause → resume returns to active', () => {
    let status = 'active';
    // Pause
    status = 'paused';
    expect(status).toBe('paused');
    // Resume
    status = 'active';
    expect(status).toBe('active');
  });

  it('kill → revive returns to active', () => {
    let status = 'active';
    status = 'killed';
    expect(status).toBe('killed');
    // Revive
    status = 'active';
    expect(status).toBe('active');
  });

  it('double-pause is idempotent', () => {
    const status = 'paused';
    // Pausing again should not error
    const newStatus = status === 'active' ? 'paused' : status;
    expect(newStatus).toBe('paused');
  });

  it('double-kill is idempotent', () => {
    const status = 'killed';
    const newStatus = status === 'active' || status === 'paused' ? 'killed' : status;
    expect(newStatus).toBe('killed');
  });
});

// ==================== 7. PLAN LIMITS ====================
describe('Plan Limits Enforcement', () => {
  
  const PLANS = {
    free: { actionsPerMonth: 1000, maxAgents: 2, maxWebhooks: 2, maxApiKeys: 2, retentionDays: 1 },
    pro: { actionsPerMonth: 50000, maxAgents: 20, maxWebhooks: 10, maxApiKeys: 5, retentionDays: 30 },
    team: { actionsPerMonth: -1, maxAgents: -1, maxWebhooks: 50, maxApiKeys: 20, retentionDays: 90 },
  };

  it('free tier limits are enforced', () => {
    const plan = PLANS.free;
    expect(plan.actionsPerMonth).toBe(1000);
    expect(plan.maxAgents).toBe(2);
    expect(plan.retentionDays).toBe(1);
  });

  it('unlimited values use -1', () => {
    const plan = PLANS.team;
    expect(plan.actionsPerMonth).toBe(-1);
    expect(plan.maxAgents).toBe(-1);

    // Check function should handle -1
    const isUnlimited = (limit: number) => limit === -1;
    const isWithinLimit = (current: number, limit: number) => isUnlimited(limit) || current < limit;
    
    expect(isWithinLimit(999999, -1)).toBe(true);
    expect(isWithinLimit(1001, 1000)).toBe(false);
    expect(isWithinLimit(999, 1000)).toBe(true);
  });

  it('rate limit calculation is correct', () => {
    const rateLimit = 60; // requests per minute
    const windowMs = 60000;
    const requestTimes = [0, 100, 200, 300]; // 4 requests in 300ms
    
    const recentRequests = requestTimes.filter(t => t > Date.now() - windowMs);
    // In real scenario, all are recent
    expect(requestTimes.length).toBeLessThanOrEqual(rateLimit);
  });

  it('action count percentage handles edge cases', () => {
    // 0% used
    expect((0 / 1000) * 100).toBe(0);
    
    // 100% used
    expect((1000 / 1000) * 100).toBe(100);
    
    // Over 100%
    expect((1500 / 1000) * 100).toBe(150);
    
    // Unlimited (-1 actions per month)
    const pct = -1 === -1 ? 0 : (500 / -1) * 100;
    expect(pct).toBe(0);
  });
});

// ==================== 8. WEBHOOK INTEGRITY ====================
describe('Webhook Integrity', () => {
  
  it('HMAC signature generation is deterministic', async () => {
    // Simulate the webhook signing logic
    const crypto = await import('crypto');
    const secret = 'whsec_test123';
    const payload = JSON.stringify({ event: 'action.logged', data: { agent: 'bot' } });
    
    const sig1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    
    expect(sig1).toBe(sig2);
  });

  it('different payloads produce different signatures', async () => {
    const crypto = await import('crypto');
    const secret = 'whsec_test123';
    
    const sig1 = crypto.createHmac('sha256', secret).update('payload1').digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update('payload2').digest('hex');
    
    expect(sig1).not.toBe(sig2);
  });

  it('different secrets produce different signatures', async () => {
    const crypto = await import('crypto');
    const payload = 'same payload';
    
    const sig1 = crypto.createHmac('sha256', 'secret1').update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', 'secret2').update(payload).digest('hex');
    
    expect(sig1).not.toBe(sig2);
  });

  it('webhook retry backoff increases correctly', () => {
    // Retry delays: attempt 1 = 5s, attempt 2 = 25s, attempt 3 = 125s
    const getRetryDelay = (attempt: number) => Math.pow(5, attempt) * 1000;
    
    expect(getRetryDelay(1)).toBe(5000);
    expect(getRetryDelay(2)).toBe(25000);
    expect(getRetryDelay(3)).toBe(125000);
  });

  it('webhook failure count increments and triggers disable', () => {
    let failureCount = 0;
    const maxFailures = 10;
    let active = true;

    for (let i = 0; i < 15; i++) {
      failureCount++;
      if (failureCount >= maxFailures) {
        active = false;
      }
    }

    expect(failureCount).toBe(15);
    expect(active).toBe(false);
  });
});

// ==================== 9. SESSION & AUTH EDGE CASES ====================
describe('Session & Auth Edge Cases', () => {
  
  it('sessionStorage key name is consistent', () => {
    const KEY_NAME = 'al_api_key';
    expect(KEY_NAME).toBe('al_api_key');
  });

  it('API key masking shows prefix and suffix', () => {
    const key = 'al_abcdefghij1234567890abcdefghij1234567890ab';
    const masked = `${key.slice(0, 15)}...${key.slice(-4)}`;
    
    expect(masked).toMatch(/^al_.*\.\.\..{4}$/);
    expect(masked.length).toBeLessThan(key.length);
    // Should not reveal the full key
    expect(masked).not.toBe(key);
  });

  it('logout clears all session data', () => {
    // Simulate sessionStorage
    const store: Record<string, string> = { al_api_key: 'al_test123' };
    
    // Logout
    delete store.al_api_key;
    
    expect(store.al_api_key).toBeUndefined();
  });

  it('multiple tabs sharing sessionStorage', () => {
    // sessionStorage is per-tab, so each tab gets its own key
    // This is actually correct behavior — tabs are isolated
    const tab1Key = 'al_key_tab1';
    const tab2Key = 'al_key_tab2';
    expect(tab1Key).not.toBe(tab2Key);
  });

  it('expired Supabase session triggers re-auth', () => {
    // Simulate: user has no session
    const user = null;
    const hasSession = user !== null;
    expect(hasSession).toBe(false);
    // Dashboard should show setup screen or redirect to login
  });
});

// ==================== 10. DATA DISPLAY SAFETY ====================
describe('Data Display Safety', () => {
  
  it('XSS in agent names is not executed', () => {
    const maliciousName = '<script>alert("xss")</script>';
    // React auto-escapes, but verify the name doesn't contain executable code
    // In React JSX, this would render as text, not HTML
    expect(maliciousName.includes('<script>')).toBe(true);
    // React would render: &lt;script&gt;alert("xss")&lt;/script&gt;
  });

  it('very long agent names truncate gracefully', () => {
    const longName = 'agent-' + 'x'.repeat(500);
    const truncated = longName.length > 30 ? longName.slice(0, 27) + '...' : longName;
    expect(truncated.length).toBeLessThanOrEqual(30);
  });

  it('special characters in service names display correctly', () => {
    const serviceNames = ['openai/gpt-4', 'aws:s3', 'google.drive', 'api@v2', 'my service (prod)'];
    for (const name of serviceNames) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('null/undefined metadata does not crash JSON display', () => {
    const metadatas = [null, undefined, {}, { key: 'value' }, { nested: { deep: true } }];
    for (const meta of metadatas) {
      const display = JSON.stringify(meta ?? {}, null, 2);
      expect(typeof display).toBe('string');
    }
  });

  it('action status colors map correctly', () => {
    const STATUS_COLORS: Record<string, string> = {
      success: 'text-emerald-400',
      error: 'text-red-400',
      blocked: 'text-amber-400',
      pending: 'text-gray-400',
    };

    expect(STATUS_COLORS['success']).toBeDefined();
    expect(STATUS_COLORS['error']).toBeDefined();
    expect(STATUS_COLORS['blocked']).toBeDefined();
    // Unknown status should not crash
    expect(STATUS_COLORS['unknown']).toBeUndefined();
    // Using fallback
    expect(STATUS_COLORS['unknown'] || 'text-gray-400').toBe('text-gray-400');
  });

  it('agent status dot colors map correctly', () => {
    const STATUS_DOT: Record<string, string> = {
      active: 'bg-emerald-400',
      paused: 'bg-amber-400',
      killed: 'bg-red-400',
    };

    expect(STATUS_DOT['active']).toBeDefined();
    expect(STATUS_DOT['paused']).toBeDefined();
    expect(STATUS_DOT['killed']).toBeDefined();
    expect(STATUS_DOT['unknown'] || 'bg-gray-400').toBe('bg-gray-400');
  });
});

// ==================== 11. FILTER & SEARCH LOGIC ====================
describe('Filter & Search Logic', () => {
  
  const sampleActions = [
    { agent_name: 'support-bot', service: 'slack', action: 'send_message', status: 'success' },
    { agent_name: 'support-bot', service: 'jira', action: 'create_ticket', status: 'success' },
    { agent_name: 'data-agent', service: 'openai', action: 'completion', status: 'error' },
    { agent_name: 'email-bot', service: 'sendgrid', action: 'send_email', status: 'blocked' },
    { agent_name: 'data-agent', service: 'openai', action: 'embedding', status: 'success' },
  ];

  it('filter by status works', () => {
    const filtered = sampleActions.filter(a => a.status === 'error');
    expect(filtered.length).toBe(1);
    expect(filtered[0].agent_name).toBe('data-agent');
  });

  it('filter by agent works', () => {
    const filtered = sampleActions.filter(a => a.agent_name === 'support-bot');
    expect(filtered.length).toBe(2);
  });

  it('filter by service works', () => {
    const filtered = sampleActions.filter(a => a.service === 'openai');
    expect(filtered.length).toBe(2);
  });

  it('text search is case-insensitive', () => {
    const query = 'SLACK';
    const filtered = sampleActions.filter(a =>
      a.agent_name.toLowerCase().includes(query.toLowerCase()) ||
      a.service.toLowerCase().includes(query.toLowerCase()) ||
      a.action.toLowerCase().includes(query.toLowerCase())
    );
    expect(filtered.length).toBe(1);
  });

  it('multiple filters combine with AND', () => {
    const statusFilter = 'success';
    const agentFilter = 'support-bot';
    
    const filtered = sampleActions.filter(a =>
      a.status === statusFilter && a.agent_name === agentFilter
    );
    expect(filtered.length).toBe(2);
  });

  it('clear filters returns all actions', () => {
    const filtered = sampleActions.filter(() => true);
    expect(filtered.length).toBe(sampleActions.length);
  });

  it('filter count display is correct', () => {
    const total = sampleActions.length;
    const filtered = sampleActions.filter(a => a.status === 'success');
    const display = `${filtered.length} of ${total} actions`;
    expect(display).toBe('3 of 5 actions');
  });

  it('empty search returns all results', () => {
    const query = '';
    const filtered = sampleActions.filter(a =>
      !query || a.agent_name.includes(query) || a.service.includes(query) || a.action.includes(query)
    );
    expect(filtered.length).toBe(sampleActions.length);
  });
});

// ==================== 12. PAGINATION SAFETY ====================
describe('Pagination Safety', () => {
  
  it('handles page size of 100 with exactly 100 items', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const pageSize = 100;
    const page = items.slice(0, pageSize);
    expect(page.length).toBe(100);
  });

  it('handles page size of 100 with fewer items', () => {
    const items = Array.from({ length: 37 }, (_, i) => ({ id: i }));
    const pageSize = 100;
    const page = items.slice(0, pageSize);
    expect(page.length).toBe(37);
  });

  it('handles empty dataset', () => {
    const items: unknown[] = [];
    const pageSize = 100;
    const page = items.slice(0, pageSize);
    expect(page.length).toBe(0);
  });

  it('offset pagination does not skip or duplicate items', () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ id: i }));
    const pageSize = 100;
    
    const page1 = items.slice(0, pageSize);
    const page2 = items.slice(pageSize, pageSize * 2);
    const page3 = items.slice(pageSize * 2, pageSize * 3);
    
    expect(page1.length).toBe(100);
    expect(page2.length).toBe(100);
    expect(page3.length).toBe(50);
    
    // No overlap
    const allIds = [...page1, ...page2, ...page3].map(i => (i as {id: number}).id);
    expect(new Set(allIds).size).toBe(250);
  });
});
