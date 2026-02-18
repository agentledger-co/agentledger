import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateApiKey, hashApiKey } from '@/lib/auth';

describe('Auth Library', () => {
  // ==================== API KEY GENERATION ====================
  describe('generateApiKey', () => {
    it('generates a key with al_ prefix', () => {
      const { key } = generateApiKey();
      expect(key).toMatch(/^al_/);
    });

    it('generates a key of correct length (al_ + 40 chars = 43)', () => {
      const { key } = generateApiKey();
      expect(key.length).toBe(43);
    });

    it('generates a hash that is a 64-char hex string (SHA-256)', () => {
      const { hash } = generateApiKey();
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates a prefix that is the first 10 chars of the key', () => {
      const { key, prefix } = generateApiKey();
      expect(prefix).toBe(key.slice(0, 10));
    });

    it('generates unique keys on each call', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey().key);
      }
      expect(keys.size).toBe(100);
    });

    it('generates unique hashes for different keys', () => {
      const { hash: hash1 } = generateApiKey();
      const { hash: hash2 } = generateApiKey();
      expect(hash1).not.toBe(hash2);
    });

    it('only uses alphanumeric characters in the random part', () => {
      for (let i = 0; i < 50; i++) {
        const { key } = generateApiKey();
        const randomPart = key.slice(3); // Remove 'al_'
        expect(randomPart).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });
  });

  // ==================== API KEY HASHING ====================
  describe('hashApiKey', () => {
    it('produces consistent hashes for the same key', () => {
      const key = 'al_testkey123';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different keys', () => {
      const hash1 = hashApiKey('al_key1');
      const hash2 = hashApiKey('al_key2');
      expect(hash1).not.toBe(hash2);
    });

    it('returns a 64-char hex string', () => {
      const hash = hashApiKey('al_anykey');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hash of generated key matches the returned hash', () => {
      const { key, hash } = generateApiKey();
      expect(hashApiKey(key)).toBe(hash);
    });
  });
});
