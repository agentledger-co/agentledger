import { vi } from 'vitest';

// ==================== SUPABASE MOCK ====================
// A chainable mock that simulates Supabase's query builder
export function createMockSupabaseChain(returnData: unknown = null, returnError: unknown = null, returnCount: number | null = null) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'is', 'in', 'like', 'ilike', 'contains', 'containedBy', 'range', 'order', 'limit',
    'single', 'maybeSingle', 'csv', 'head', 'count'];

  methods.forEach(method => {
    chain[method] = vi.fn().mockReturnValue(chain);
  });

  // Terminal methods return data
  chain.then = undefined;
  (chain as Record<string, unknown>).data = returnData;
  (chain as Record<string, unknown>).error = returnError;
  (chain as Record<string, unknown>).count = returnCount;

  // Make it thenable for await
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void) => {
      resolve({ data: returnData, error: returnError, count: returnCount });
    },
  });

  return chain;
}

export function createMockSupabase(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn().mockReturnValue(createMockSupabaseChain()),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    ...overrides,
  };
}

// Mock Next.js modules
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
}));

// ==================== NEXT REQUEST/RESPONSE HELPERS ====================
export function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}) {
  const { method = 'GET', url = 'http://localhost:3000/api/test', headers = {}, body } = options;

  return {
    method,
    url,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || headers[name] || null,
      ...headers,
    },
    json: vi.fn().mockResolvedValue(body || {}),
    nextUrl: new URL(url),
  } as unknown;
}
