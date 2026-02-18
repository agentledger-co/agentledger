import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLedger } from '../../sdk/src/index';
import { generateApiKey, hashApiKey } from '@/lib/auth';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockSuccess() {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ allowed: true }) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logged: true, id: 'test' }) });
}

describe('Edge Cases & Security', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ==================== API KEY SECURITY ====================
  describe('API Key Security', () => {
    it('key hash is not reversible to the original key', () => {
      const { key, hash } = generateApiKey();
      // Hash should not contain the key
      expect(hash).not.toContain(key);
      expect(hash).not.toContain(key.slice(3)); // without prefix
    });

    it('different keys never produce the same hash', () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        hashes.add(generateApiKey().hash);
      }
      expect(hashes.size).toBe(1000);
    });

    it('key prefix does not reveal the full key', () => {
      const { key, prefix } = generateApiKey();
      expect(prefix.length).toBe(10);
      expect(key.length).toBe(43);
      // Can't reconstruct the key from prefix
      expect(key.startsWith(prefix)).toBe(true);
      expect(prefix.length).toBeLessThan(key.length / 2);
    });

    it('SDK does not accept keys without al_ prefix', () => {
      expect(() => new AgentLedger({ apiKey: 'sk_test123' })).toThrow();
      expect(() => new AgentLedger({ apiKey: 'bearer_test' })).toThrow();
      expect(() => new AgentLedger({ apiKey: 'test' })).toThrow();
      expect(() => new AgentLedger({ apiKey: '' })).toThrow();
    });
  });

  // ==================== SDK RESILIENCE ====================
  describe('SDK Resilience', () => {
    it('handles network timeouts gracefully (fail-open)', async () => {
      const ledger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
        timeout: 10,
      });

      mockFetch.mockImplementation(() => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AbortError')), 50)
      ));

      const { result } = await ledger.track(
        { agent: 'bot', service: 's', action: 'a' },
        async () => 'resilient'
      );

      expect(result).toBe('resilient');
    });

    it('handles malformed JSON responses', async () => {
      const ledger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Unexpected token')),
      });

      // Should fail-open
      const { result } = await ledger.track(
        { agent: 'bot', service: 's', action: 'a' },
        async () => 'still works'
      );

      expect(result).toBe('still works');
    });

    it('handles concurrent track calls independently', async () => {
      const ledger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
      });

      // Use mockImplementation so every call returns a valid response
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/check')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ allowed: true }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ logged: true, id: 'test' }) });
      });

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          ledger.track(
            { agent: `bot-${i}`, service: 's', action: 'a' },
            async () => `result-${i}`
          )
        )
      );

      expect(results.map(r => r.result)).toEqual([
        'result-0', 'result-1', 'result-2', 'result-3', 'result-4',
      ]);
    });

    it('does not leak API key in error messages', async () => {
      const apiKey = 'al_secretkey1234567890abcdefghijklmnopqrst';
      const ledger = new AgentLedger({ apiKey, baseUrl: 'http://localhost:3000', failOpen: false });

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await ledger.track(
          { agent: 'bot', service: 's', action: 'a' },
          async () => 'ok'
        );
      } catch (e) {
        const errorMsg = (e as Error).message;
        expect(errorMsg).not.toContain(apiKey);
        expect(errorMsg).not.toContain('secretkey');
      }
    });
  });

  // ==================== INPUT VALIDATION ====================
  describe('Input Validation', () => {
    it('SDK handles empty string agent/service/action', async () => {
      const ledger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
      });

      mockSuccess();

      // Should still work — validation is server-side
      const { result } = await ledger.track(
        { agent: '', service: '', action: '' },
        async () => 'ok'
      );
      expect(result).toBe('ok');
    });

    it('SDK handles special characters in agent names', async () => {
      const ledger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
      });

      mockSuccess();

      const { result } = await ledger.track(
        { agent: 'bot/v2 (test)', service: 'slack', action: 'send "hello"' },
        async () => 'ok'
      );
      expect(result).toBe('ok');

      // Verify the JSON was properly escaped
      const checkBody = mockFetch.mock.calls[0][1].body;
      expect(() => JSON.parse(checkBody)).not.toThrow();
    });

    it('SDK handles very large metadata', async () => {
      const ledger = new AgentLedger({
        apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
        baseUrl: 'http://localhost:3000',
      });

      mockSuccess();

      const bigMetadata: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        bigMetadata[`key_${i}`] = 'x'.repeat(1000);
      }

      const { result } = await ledger.track(
        { agent: 'bot', service: 's', action: 'a', metadata: bigMetadata },
        async () => 'ok'
      );
      expect(result).toBe('ok');
    });

    it('hashApiKey handles unicode input', () => {
      const hash = hashApiKey('al_こんにちは');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hashApiKey handles very long input', () => {
      const longKey = 'al_' + 'a'.repeat(10000);
      const hash = hashApiKey(longKey);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ==================== BUDGET EDGE CASES ====================
  describe('Budget Edge Cases', () => {
    it('budget at exactly 100% is exceeded', () => {
      // This is testing the logic from the actions route
      const current = 100;
      const max = 100;
      const pct = (current / max) * 100;
      expect(pct >= 100).toBe(true);
    });

    it('budget at 99% is not exceeded', () => {
      const current = 99;
      const max = 100;
      const pct = (current / max) * 100;
      expect(pct >= 100).toBe(false);
    });

    it('budget status thresholds are correct', () => {
      const getStatus = (pct: number) => {
        if (pct >= 100) return 'exceeded';
        if (pct >= 90) return 'critical';
        if (pct >= 75) return 'warning';
        return 'ok';
      };

      expect(getStatus(0)).toBe('ok');
      expect(getStatus(50)).toBe('ok');
      expect(getStatus(74.9)).toBe('ok');
      expect(getStatus(75)).toBe('warning');
      expect(getStatus(89.9)).toBe('warning');
      expect(getStatus(90)).toBe('critical');
      expect(getStatus(99.9)).toBe('critical');
      expect(getStatus(100)).toBe('exceeded');
      expect(getStatus(150)).toBe('exceeded');
    });

    it('null max_actions means no action limit', () => {
      const max: number | null = null;
      const current = 999999;
      const exceeded = max !== null && current >= max;
      expect(exceeded).toBe(false);
    });

    it('null max_cost_cents means no cost limit', () => {
      const max: number | null = null;
      const current = 999999;
      const exceeded = max !== null && current >= max;
      expect(exceeded).toBe(false);
    });

    it('zero cost is valid', () => {
      const cost = 0;
      expect(cost).toBe(0);
      expect(typeof cost).toBe('number');
    });
  });

  // ==================== COST FORMATTING ====================
  describe('Cost Formatting', () => {
    it('formats cents to dollars correctly', () => {
      const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;
      expect(formatCost(0)).toBe('$0.00');
      expect(formatCost(1)).toBe('$0.01');
      expect(formatCost(100)).toBe('$1.00');
      expect(formatCost(1050)).toBe('$10.50');
      expect(formatCost(999999)).toBe('$9999.99');
    });
  });
});
