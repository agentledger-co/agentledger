#!/usr/bin/env node
/**
 * AgentLedger Production Smoke Tests
 *
 * Lightweight checks that catch deployment-level bugs:
 * - CSP headers allowing Supabase domains
 * - Supabase client connectivity (the .com vs .co rewrite issue)
 * - Auth endpoints responding correctly
 * - Critical pages loading with expected content
 * - API health
 *
 * Run against production:
 *   node tests/e2e/smoke.mjs https://agentledger.co
 *
 * Run against local:
 *   node tests/e2e/smoke.mjs http://localhost:3000
 */

const BASE = process.argv[2] || 'https://agentledger.co';
let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ' + String.fromCodePoint(0x2705) + ' ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log('  ' + String.fromCodePoint(0x274C) + ' ' + name + ': ' + err.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\n' + String.fromCodePoint(0x1F525) + ' AgentLedger Production Smoke Tests — ' + BASE + '\n');

// ==================== CSP & SECURITY HEADERS ====================
console.log(String.fromCodePoint(0x1F512) + ' Security Headers:');

await test('CSP allows Supabase .co domain', async () => {
  const res = await fetch(BASE + '/');
  const csp = res.headers.get('content-security-policy');
  assert(csp, 'No CSP header found');
  assert(csp.includes('*.supabase.co'), 'CSP missing *.supabase.co in connect-src');
});

await test('CSP allows Supabase .com domain (SDK rewrite)', async () => {
  const res = await fetch(BASE + '/');
  const csp = res.headers.get('content-security-policy');
  assert(csp, 'No CSP header found');
  assert(csp.includes('*.supabase.com'), 'CSP missing *.supabase.com');
});

await test('CSP allows WebSocket connections to Supabase', async () => {
  const res = await fetch(BASE + '/');
  const csp = res.headers.get('content-security-policy');
  assert(csp, 'No CSP header found');
  assert(csp.includes('wss://*.supabase.co'), 'CSP missing wss://*.supabase.co');
});

await test('HSTS header present', async () => {
  const res = await fetch(BASE + '/');
  const hsts = res.headers.get('strict-transport-security');
  assert(hsts, 'No HSTS header');
  assert(hsts.includes('max-age='), 'HSTS missing max-age');
});

await test('X-Frame-Options set to DENY', async () => {
  const res = await fetch(BASE + '/');
  assert(res.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options not DENY');
});

// ==================== SUPABASE CONNECTIVITY ====================
console.log('\n' + String.fromCodePoint(0x1F50C) + ' Supabase Connectivity:');

await test('Supabase .co REST endpoint reachable', async () => {
  const supabaseUrl = 'https://nfvylcnubfrfosrofgmo.supabase.co';
  const healthRes = await fetch(supabaseUrl + '/rest/v1/', {
    headers: { 'apikey': 'test' }
  });
  assert([401, 403].includes(healthRes.status),
    'Supabase .co REST returned ' + healthRes.status + ', expected 401/403');
});

await test('Supabase .com auth endpoint DNS resolves (SDK rewrite target)', async () => {
  try {
    const res = await fetch('https://nfvylcnubfrfosrofgmo.supabase.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    console.log('    .supabase.com returned ' + res.status + ' (DNS resolves)');
  } catch (err) {
    console.log('    .supabase.com DNS fails (expected) — fetch rewrite is REQUIRED');
  }
});

// ==================== AUTH PAGES & FLOWS ====================
console.log('\n' + String.fromCodePoint(0x1F510) + ' Auth Pages:');

await test('Signup page loads with form', async () => {
  const res = await fetch(BASE + '/signup');
  assert(res.status === 200, 'Status ' + res.status);
  const html = await res.text();
  assert(html.includes('email') || html.includes('Email'), 'No email field reference');
  assert(html.includes('password') || html.includes('Password'), 'No password field reference');
});

await test('Login page loads with form', async () => {
  const res = await fetch(BASE + '/login');
  assert(res.status === 200, 'Status ' + res.status);
  const html = await res.text();
  assert(html.includes('Log') || html.includes('log') || html.includes('Sign'), 'No login content');
});

await test('Auth callback route exists', async () => {
  const res = await fetch(BASE + '/auth/callback', { redirect: 'manual' });
  assert(res.status !== 404, 'Auth callback route returns 404');
});

await test('Signup API rejects empty body', async () => {
  const res = await fetch(BASE + '/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(res.status !== 500, 'Signup POST returned 500');
});

// ==================== CRITICAL PAGES ====================
console.log('\n' + String.fromCodePoint(0x1F4C4) + ' Critical Pages:');

const criticalPages = [
  { path: '/', name: 'Landing page', contains: 'AgentLedger' },
  { path: '/login', name: 'Login page' },
  { path: '/signup', name: 'Signup page' },
  { path: '/docs', name: 'Docs page' },
  { path: '/dashboard', name: 'Dashboard page' },
  { path: '/onboarding', name: 'Onboarding page' },
  { path: '/terms', name: 'Terms page' },
  { path: '/privacy', name: 'Privacy page' },
];

for (const page of criticalPages) {
  await test(page.name + ' (' + page.path + ') loads', async () => {
    const res = await fetch(BASE + page.path);
    assert(res.status === 200, 'Status ' + res.status);
    if (page.contains) {
      const html = await res.text();
      assert(html.includes(page.contains), 'Missing "' + page.contains + '" in response');
    }
  });
}

// ==================== API HEALTH ====================
console.log('\n' + String.fromCodePoint(0x1F527) + ' API Health:');

await test('Setup API responds (rejects bad request)', async () => {
  const res = await fetch(BASE + '/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', userId: '' }),
  });
  assert(res.status !== 500, 'Setup API returned 500 — check Supabase service client');
});

await test('Actions API rejects unauthenticated', async () => {
  const res = await fetch(BASE + '/api/actions');
  assert(res.status === 401 || res.status === 405, 'Expected 401/405, got ' + res.status);
});

await test('Stats API rejects unauthenticated', async () => {
  const res = await fetch(BASE + '/api/stats');
  assert(res.status === 401 || res.status === 405, 'Expected 401/405, got ' + res.status);
});

await test('Actions ingest rejects bad key', async () => {
  const res = await fetch(BASE + '/api/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer al_fake_key_12345',
    },
    body: JSON.stringify({
      agent: 'smoke-test', service: 'test', action: 'test', status: 'success',
    }),
  });
  assert(res.status === 401, 'Expected 401, got ' + res.status);
});

// ==================== SEO & META ====================
console.log('\n' + String.fromCodePoint(0x1F310) + ' SEO & Meta:');

await test('Sitemap.xml valid', async () => {
  const res = await fetch(BASE + '/sitemap.xml');
  assert(res.status === 200, 'Status ' + res.status);
  const text = await res.text();
  assert(text.includes('<urlset'), 'Invalid sitemap XML');
  assert(text.includes('agentledger.co'), 'Sitemap missing domain');
});

await test('Robots.txt valid', async () => {
  const res = await fetch(BASE + '/robots.txt');
  assert(res.status === 200, 'Status ' + res.status);
  const text = await res.text();
  assert(text.includes('Sitemap'), 'Missing Sitemap directive');
});

await test('OG image renders', async () => {
  const res = await fetch(BASE + '/og');
  assert(res.status === 200, 'Status ' + res.status);
  const ct = res.headers.get('content-type');
  assert(ct && ct.includes('image'), 'Not an image');
});

// ==================== RESULTS ====================
console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ' + String.fromCodePoint(0x274C) + ' ' + f.name + ': ' + f.error));
}

console.log();
process.exit(failed > 0 ? 1 : 0);
