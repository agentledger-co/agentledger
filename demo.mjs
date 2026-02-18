#!/usr/bin/env node

/**
 * AgentLedger Demo — See it working in 60 seconds
 * 
 * Usage:
 *   AGENTLEDGER_KEY=al_... node demo.mjs
 * 
 * Or just run it and enter your key when prompted.
 * Get a key at: https://agentledger.co
 */

const BASE = process.env.AGENTLEDGER_URL || 'https://agentledger.co';

async function main() {
  let apiKey = process.env.AGENTLEDGER_KEY;

  if (!apiKey) {
    // Check if running interactively
    if (process.stdin.isTTY) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      apiKey = await new Promise(resolve => {
        rl.question('\n🔑 Enter your AgentLedger API key (from agentledger.co): ', answer => {
          rl.close();
          resolve(answer.trim());
        });
      });
    } else {
      console.error('❌ Set AGENTLEDGER_KEY environment variable');
      process.exit(1);
    }
  }

  if (!apiKey || !apiKey.startsWith('al_')) {
    console.error('❌ Invalid API key. Keys start with "al_". Get one at agentledger.co');
    process.exit(1);
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  console.log('\n⚡ AgentLedger Demo');
  console.log('━'.repeat(50));

  // 1. Log some actions
  const agents = ['demo-bot', 'research-agent'];
  const actions = [
    { service: 'openai', action: 'completion', costCents: 3 },
    { service: 'slack', action: 'send_message', costCents: 0 },
    { service: 'stripe', action: 'create_invoice', costCents: 0 },
    { service: 'github', action: 'create_issue', costCents: 0 },
    { service: 'anthropic', action: 'tool_use', costCents: 5 },
  ];

  console.log('\n📝 Logging 10 agent actions...');
  for (let i = 0; i < 10; i++) {
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const act = actions[Math.floor(Math.random() * actions.length)];
    const status = Math.random() > 0.85 ? 'error' : 'success';

    const res = await fetch(`${BASE}/api/v1/actions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agent,
        service: act.service,
        action: act.action,
        status,
        cost_cents: act.costCents,
        duration_ms: Math.floor(Math.random() * 2000) + 100,
        metadata: { demo: true, iteration: i + 1 },
      }),
    });

    const data = await res.json();
    const icon = status === 'error' ? '❌' : '✅';
    console.log(`  ${icon} ${agent} → ${act.service}.${act.action} ${status === 'error' ? '(error)' : ''}`);

    if (!res.ok) {
      console.error(`     ⚠️  ${data.error || 'Failed'}`);
    }
  }

  // 2. Check stats
  console.log('\n📊 Fetching dashboard stats...');
  const statsRes = await fetch(`${BASE}/api/v1/stats`, { headers });
  if (statsRes.ok) {
    const stats = await statsRes.json();
    console.log(`  Total actions: ${stats.totalActions}`);
    console.log(`  Today: ${stats.todayActions} actions, $${((stats.todayCostCents || 0) / 100).toFixed(2)} spent`);
    console.log(`  Active agents: ${stats.activeAgents}`);
    console.log(`  Error rate: ${stats.todayActions > 0 ? ((stats.errorCount / stats.todayActions) * 100).toFixed(1) : 0}%`);
  }

  // 3. Pre-flight check
  console.log('\n🔍 Running pre-flight check...');
  const checkRes = await fetch(`${BASE}/api/v1/check`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ agent: 'demo-bot', service: 'stripe', action: 'charge' }),
  });
  if (checkRes.ok) {
    const check = await checkRes.json();
    console.log(`  Allowed: ${check.allowed ? '✅ Yes' : `❌ No — ${check.blockReason}`}`);
  }

  // 4. Pause and resume
  console.log('\n⏸️  Pausing demo-bot...');
  await fetch(`${BASE}/api/v1/agents/demo-bot/pause`, { method: 'POST', headers });

  const pauseCheck = await fetch(`${BASE}/api/v1/check`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ agent: 'demo-bot' }),
  });
  if (pauseCheck.ok) {
    const check = await pauseCheck.json();
    console.log(`  Pre-flight check: ${check.allowed ? 'Allowed' : `❌ Blocked — ${check.blockReason}`}`);
  }

  console.log('\n▶️  Resuming demo-bot...');
  await fetch(`${BASE}/api/v1/agents/demo-bot/resume`, { method: 'POST', headers });
  console.log('  ✅ Agent resumed');

  // 5. Show dashboard link
  console.log('\n━'.repeat(50));
  console.log(`\n🎉 Done! Open your dashboard:`);
  console.log(`   ${BASE}/dashboard\n`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
