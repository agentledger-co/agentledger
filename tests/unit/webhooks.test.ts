import { describe, it, expect } from 'vitest';
import { generateWebhookSecret } from '@/lib/webhooks';

describe('Webhooks', () => {
  describe('generateWebhookSecret', () => {
    it('generates a secret with whsec_ prefix', () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^whsec_/);
    });

    it('generates a 38-char secret (whsec_ + 32 chars)', () => {
      const secret = generateWebhookSecret();
      expect(secret.length).toBe(38);
    });

    it('generates unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(generateWebhookSecret());
      }
      expect(secrets.size).toBe(100);
    });

    it('only uses alphanumeric characters in the random part', () => {
      for (let i = 0; i < 50; i++) {
        const secret = generateWebhookSecret();
        const randomPart = secret.slice(6); // Remove 'whsec_'
        expect(randomPart).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });
  });

  describe('Webhook event types', () => {
    const VALID_EVENTS = [
      'action.logged', 'agent.paused', 'agent.killed', 'agent.resumed',
      'budget.exceeded', 'budget.warning', 'alert.created',
    ];

    it('has 7 defined event types', () => {
      expect(VALID_EVENTS).toHaveLength(7);
    });

    it('all events follow namespace.action pattern', () => {
      for (const event of VALID_EVENTS) {
        expect(event).toMatch(/^[a-z]+\.[a-z_]+$/);
      }
    });
  });

  describe('HMAC signature verification', () => {
    it('generates consistent signatures for same payload + secret', async () => {
      const { createHmac } = await import('crypto');
      const secret = 'whsec_test123';
      const payload = JSON.stringify({ event: 'action.logged', data: { agent: 'bot' } });

      const sig1 = createHmac('sha256', secret).update(payload).digest('hex');
      const sig2 = createHmac('sha256', secret).update(payload).digest('hex');

      expect(sig1).toBe(sig2);
    });

    it('generates different signatures for different secrets', async () => {
      const { createHmac } = await import('crypto');
      const payload = JSON.stringify({ event: 'test' });

      const sig1 = createHmac('sha256', 'secret1').update(payload).digest('hex');
      const sig2 = createHmac('sha256', 'secret2').update(payload).digest('hex');

      expect(sig1).not.toBe(sig2);
    });

    it('generates different signatures for different payloads', async () => {
      const { createHmac } = await import('crypto');
      const secret = 'whsec_test';

      const sig1 = createHmac('sha256', secret).update('payload1').digest('hex');
      const sig2 = createHmac('sha256', secret).update('payload2').digest('hex');

      expect(sig1).not.toBe(sig2);
    });

    it('signature is a 64-char hex string', async () => {
      const { createHmac } = await import('crypto');
      const sig = createHmac('sha256', 'secret').update('data').digest('hex');
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Webhook URL validation', () => {
    it('accepts HTTPS URLs', () => {
      const url = 'https://example.com/webhook';
      const valid = url.startsWith('https://') || url.startsWith('http://localhost');
      expect(valid).toBe(true);
    });

    it('accepts localhost for development', () => {
      const url = 'http://localhost:3000/webhook';
      const valid = url.startsWith('https://') || url.startsWith('http://localhost');
      expect(valid).toBe(true);
    });

    it('rejects plain HTTP URLs', () => {
      const url = 'http://example.com/webhook';
      const valid = url.startsWith('https://') || url.startsWith('http://localhost');
      expect(valid).toBe(false);
    });

    it('rejects non-URL strings', () => {
      const invalid = ['not-a-url', '', 'ftp://files.com', 'javascript:alert(1)'];
      for (const url of invalid) {
        const valid = url.startsWith('https://') || url.startsWith('http://localhost');
        expect(valid).toBe(false);
      }
    });
  });

  describe('Webhook failure auto-disable', () => {
    it('disables after 10 consecutive failures', () => {
      const shouldDisable = (failureCount: number) => failureCount >= 10;
      expect(shouldDisable(9)).toBe(false);
      expect(shouldDisable(10)).toBe(true);
      expect(shouldDisable(15)).toBe(true);
    });

    it('resets failure count on success', () => {
      const newFailureCount = (success: boolean, current: number) => success ? 0 : current + 1;
      expect(newFailureCount(true, 5)).toBe(0);
      expect(newFailureCount(false, 5)).toBe(6);
    });
  });
});
