import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLedger } from '../../sdk/src/index';
import { withAgentLedger, createToolExecutor, wrapOpenAICompletion } from '../../sdk/src/integrations/openai';
import { trackFunction } from '../../sdk/src/integrations/express';
import { wrapMCPTool } from '../../sdk/src/integrations/mcp';

// ==================== MOCK FETCH ====================
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchSuccess() {
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ allowed: true }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ logged: true, id: 'test-id' }) });
}

describe('SDK Integrations', () => {
  let ledger: AgentLedger;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new AgentLedger({
      apiKey: 'al_testkey1234567890abcdefghijklmnopqrstuv',
      baseUrl: 'http://localhost:3000',
    });
  });

  // ==================== OpenAI: withAgentLedger ====================
  describe('withAgentLedger (OpenAI)', () => {
    it('wraps a function preserving its return value', async () => {
      mockFetchSuccess();

      const original = async (to: string, body: string) => `sent to ${to}: ${body}`;
      const wrapped = withAgentLedger(ledger, {
        agent: 'bot',
        service: 'email',
        action: 'send',
      }, original);

      const result = await wrapped('user@test.com', 'hello');
      expect(result).toBe('sent to user@test.com: hello');
    });

    it('preserves function argument types', async () => {
      mockFetchSuccess();

      const original = async (count: number): Promise<number[]> => Array.from({ length: count }, (_, i) => i);
      const wrapped = withAgentLedger(ledger, {
        agent: 'bot',
        service: 'math',
        action: 'generate',
      }, original);

      const result = await wrapped(5);
      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    it('propagates errors from the wrapped function', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ allowed: true }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logged: true }) });

      const failing = async () => { throw new Error('API timeout'); };
      const wrapped = withAgentLedger(ledger, {
        agent: 'bot',
        service: 'slack',
        action: 'post',
      }, failing);

      await expect(wrapped()).rejects.toThrow('API timeout');
    });
  });

  // ==================== OpenAI: createToolExecutor ====================
  describe('createToolExecutor (OpenAI)', () => {
    it('routes tool calls to correct handlers', async () => {
      mockFetchSuccess();

      const handlers = {
        send_email: vi.fn().mockResolvedValue({ sent: true }),
        create_ticket: vi.fn().mockResolvedValue({ id: 'TICK-1' }),
      };

      const execute = createToolExecutor(ledger, 'agent', handlers);

      const result = await execute('send_email', { to: 'test@test.com' });
      expect(result).toEqual({ sent: true });
      expect(handlers.send_email).toHaveBeenCalledWith({ to: 'test@test.com' });
    });

    it('applies service mapping', async () => {
      mockFetchSuccess();

      const handlers = {
        send_email: vi.fn().mockResolvedValue('ok'),
      };

      const serviceMap = {
        send_email: { service: 'sendgrid', action: 'send' },
      };

      const execute = createToolExecutor(ledger, 'bot', handlers, serviceMap);
      await execute('send_email', {});

      // Verify the check call uses mapped service
      const checkBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(checkBody.agent).toBe('bot');
      expect(checkBody.service).toBe('sendgrid');
      expect(checkBody.action).toBe('send');
    });

    it('throws on unknown tool name', async () => {
      const execute = createToolExecutor(ledger, 'agent', {});
      await expect(execute('nonexistent', {})).rejects.toThrow('Unknown tool');
    });
  });

  // ==================== Express: trackFunction ====================
  describe('trackFunction (Express/Generic)', () => {
    it('wraps an async function with tracking', async () => {
      mockFetchSuccess();

      const original = async (x: number, y: number) => x + y;
      const tracked = trackFunction(ledger, {
        agent: 'calculator',
        service: 'math',
        action: 'add',
      }, original);

      const result = await tracked(3, 4);
      expect(result).toBe(7);
    });

    it('preserves error propagation', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ allowed: true }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logged: true }) });

      const failing = async () => { throw new Error('division by zero'); };
      const tracked = trackFunction(ledger, {
        agent: 'calc',
        service: 'math',
        action: 'divide',
      }, failing);

      await expect(tracked()).rejects.toThrow('division by zero');
    });
  });

  // ==================== MCP: wrapMCPTool ====================
  describe('wrapMCPTool (MCP)', () => {
    it('wraps an MCP tool handler', async () => {
      mockFetchSuccess();

      const handler = async (args: { query: string }) => ({ results: [`Found: ${args.query}`] });
      const wrapped = wrapMCPTool(ledger, {
        agent: 'mcp-server',
        service: 'search',
        action: 'web_search',
      }, handler);

      const result = await wrapped({ query: 'AI news' });
      expect(result).toEqual({ results: ['Found: AI news'] });
    });

    it('logs the tool invocation', async () => {
      mockFetchSuccess();

      const handler = async () => 'ok';
      const wrapped = wrapMCPTool(ledger, {
        agent: 'mcp',
        service: 'tools',
        action: 'invoke',
      }, handler);

      await wrapped({ test: true });

      // Should have called check + log
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
