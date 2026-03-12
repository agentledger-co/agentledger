import { describe, it, expect } from 'vitest';
import { PLANS, checkRateLimit } from '@/lib/usage';

describe('Usage Limits', () => {
  describe('Plan definitions', () => {
    it('has free, pro, and team plans', () => {
      expect(PLANS.free).toBeDefined();
      expect(PLANS.pro).toBeDefined();
      expect(PLANS.team).toBeDefined();
    });

    it('free plan has correct limits', () => {
      expect(PLANS.free.actionsPerMonth).toBe(5_000);
      expect(PLANS.free.maxAgents).toBe(5);
      expect(PLANS.free.retentionDays).toBe(7);
      expect(PLANS.free.webhooksAllowed).toBe(true);
      expect(PLANS.free.ratePerMinute).toBe(60);
    });

    it('pro plan has higher limits than free', () => {
      expect(PLANS.pro.actionsPerMonth).toBeGreaterThan(PLANS.free.actionsPerMonth);
      expect(PLANS.pro.maxAgents).toBeGreaterThan(PLANS.free.maxAgents);
      expect(PLANS.pro.retentionDays).toBeGreaterThan(PLANS.free.retentionDays);
      expect(PLANS.pro.ratePerMinute).toBeGreaterThan(PLANS.free.ratePerMinute);
    });

    it('team plan has higher limits than pro', () => {
      expect(PLANS.team.actionsPerMonth).toBeGreaterThan(PLANS.pro.actionsPerMonth);
      expect(PLANS.team.maxAgents).toBeGreaterThan(PLANS.pro.maxAgents);
      expect(PLANS.team.retentionDays).toBeGreaterThan(PLANS.pro.retentionDays);
      expect(PLANS.team.ratePerMinute).toBeGreaterThan(PLANS.pro.ratePerMinute);
    });

    it('all plans have positive limits', () => {
      for (const [, plan] of Object.entries(PLANS)) {
        expect(plan.actionsPerMonth).toBeGreaterThan(0);
        expect(plan.maxAgents).toBeGreaterThan(0);
        expect(plan.retentionDays).toBeGreaterThan(0);
        expect(plan.ratePerMinute).toBeGreaterThan(0);
        expect(plan.maxApiKeys).toBeGreaterThan(0);
      }
    });
  });

  describe('Rate limiting', () => {
    it('allows first request', () => {
      const result = checkRateLimit('test-org-1', 'free');
      expect(result.allowed).toBe(true);
    });

    it('allows requests within limit', () => {
      const orgId = `test-org-burst-${Date.now()}`;
      for (let i = 0; i < 25; i++) {
        const result = checkRateLimit(orgId, 'free');
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks requests over free tier limit (30/min)', () => {
      const orgId = `test-org-limit-${Date.now()}`;
      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        checkRateLimit(orgId, 'free');
      }
      const result = checkRateLimit(orgId, 'free');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('different orgs have independent limits', () => {
      const org1 = `test-org-ind-1-${Date.now()}`;
      const org2 = `test-org-ind-2-${Date.now()}`;

      // Exhaust org1
      for (let i = 0; i < 60; i++) {
        checkRateLimit(org1, 'free');
      }

      // org2 should still be allowed
      const result = checkRateLimit(org2, 'free');
      expect(result.allowed).toBe(true);
    });

    it('pro plan has higher rate limit', () => {
      const orgId = `test-org-pro-${Date.now()}`;
      // Send more than free limit
      for (let i = 0; i < 35; i++) {
        checkRateLimit(orgId, 'pro');
      }
      // Should still be allowed on pro (200/min limit)
      const result = checkRateLimit(orgId, 'pro');
      expect(result.allowed).toBe(true);
    });

    it('returns retryAfter in seconds', () => {
      const orgId = `test-org-retry-${Date.now()}`;
      for (let i = 0; i < 60; i++) {
        checkRateLimit(orgId, 'free');
      }
      const result = checkRateLimit(orgId, 'free');
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('Usage percentage calculations', () => {
    it('calculates correct percentage', () => {
      const used = 750;
      const limit = 1000;
      const percent = (used / limit) * 100;
      expect(percent).toBe(75);
    });

    it('handles over-limit percentage', () => {
      const used = 1200;
      const limit = 1000;
      const percent = (used / limit) * 100;
      expect(percent).toBe(120);
    });

    it('handles zero usage', () => {
      const percent = (0 / 1000) * 100;
      expect(percent).toBe(0);
    });
  });

  describe('Data retention calculations', () => {
    it('free tier cutoff is 7 days ago', () => {
      const retentionDays = PLANS.free.retentionDays;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const hoursDiff = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60);
      expect(Math.round(hoursDiff)).toBe(168);
    });

    it('pro tier cutoff is 90 days ago', () => {
      const retentionDays = PLANS.pro.retentionDays;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const daysDiff = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(daysDiff)).toBe(90);
    });
  });
});
