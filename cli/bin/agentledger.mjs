#!/usr/bin/env node

const VERSION = '0.5.0';

// ==================== HELPERS ====================
function env(key) {
  return process.env[key] || '';
}

function getConfig() {
  const apiKey = env('AGENTLEDGER_KEY') || env('AGENTLEDGER_API_KEY');
  const baseUrl = env('AGENTLEDGER_URL') || 'https://agentledger.co';
  if (!apiKey) {
    console.error('Error: Set AGENTLEDGER_KEY or AGENTLEDGER_API_KEY environment variable.');
    process.exit(1);
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

async function request(method, path, body) {
  const { apiKey, baseUrl } = getConfig();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    console.error(`Error: ${err.error || err.message || res.statusText}`);
    process.exit(1);
  }
  return res.json();
}

function formatCost(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function pad(str, len) {
  return String(str).padEnd(len).slice(0, len);
}

// ==================== COMMANDS ====================
const commands = {
  async stats() {
    const data = await request('GET', '/api/v1/stats');
    console.log('\n  AgentLedger Stats');
    console.log('  ─────────────────────────────────');
    console.log(`  Total Actions:    ${data.totalActions}`);
    console.log(`  Today Actions:    ${data.todayActions}`);
    console.log(`  Today Cost:       ${formatCost(data.todayCostCents)}`);
    console.log(`  Week Cost:        ${formatCost(data.weekCostCents)}`);
    console.log(`  Active Agents:    ${data.activeAgents}/${data.totalAgents}`);
    console.log(`  Errors Today:     ${data.errorCount}`);
    console.log(`  Blocked Today:    ${data.blockedCount}`);
    if (data.alerts?.length > 0) {
      console.log(`  Active Alerts:    ${data.alerts.length}`);
    }
    console.log('');
  },

  async actions() {
    const limit = getArg('--limit') || '20';
    const agent = getArg('--agent');
    const params = new URLSearchParams({ limit });
    if (agent) params.set('agent', agent);
    const data = await request('GET', `/api/v1/actions?${params}`);
    console.log('');
    console.log(`  ${pad('Agent', 20)} ${pad('Service', 15)} ${pad('Action', 20)} ${pad('Status', 8)} ${pad('Cost', 10)} ${pad('Time', 10)}`);
    console.log(`  ${'─'.repeat(83)}`);
    for (const a of data.actions) {
      const status = a.status === 'success' ? '\x1b[32m✓\x1b[0m' : a.status === 'error' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m⊘\x1b[0m';
      console.log(`  ${pad(a.agent_name, 20)} ${pad(a.service, 15)} ${pad(a.action, 20)} ${status}${pad('', 6)} ${pad(formatCost(a.estimated_cost_cents), 10)} ${timeAgo(a.created_at)}`);
    }
    console.log(`\n  Showing ${data.actions.length} of ${data.total} actions\n`);
  },

  async agents() {
    const data = await request('GET', '/api/v1/stats');
    console.log('');
    console.log(`  ${pad('Agent', 25)} ${pad('Status', 10)} ${pad('Actions', 10)} ${pad('Cost', 12)} ${pad('Last Active', 15)}`);
    console.log(`  ${'─'.repeat(72)}`);
    for (const a of data.agents) {
      const statusColor = a.status === 'active' ? '\x1b[32m' : a.status === 'paused' ? '\x1b[33m' : '\x1b[31m';
      console.log(`  ${pad(a.name, 25)} ${statusColor}${pad(a.status, 10)}\x1b[0m ${pad(a.total_actions, 10)} ${pad(formatCost(a.total_cost_cents), 12)} ${a.last_active_at ? timeAgo(a.last_active_at) : 'never'}`);
    }
    console.log('');
  },

  async pause() {
    const name = args[1];
    if (!name) { console.error('Usage: agentledger pause <agent-name>'); process.exit(1); }
    await request('POST', `/api/v1/agents/${encodeURIComponent(name)}/pause`);
    console.log(`Agent "${name}" paused.`);
  },

  async resume() {
    const name = args[1];
    if (!name) { console.error('Usage: agentledger resume <agent-name>'); process.exit(1); }
    await request('POST', `/api/v1/agents/${encodeURIComponent(name)}/resume`);
    console.log(`Agent "${name}" resumed.`);
  },

  async kill() {
    const name = args[1];
    if (!name) { console.error('Usage: agentledger kill <agent-name>'); process.exit(1); }
    await request('POST', `/api/v1/agents/${encodeURIComponent(name)}/kill`);
    console.log(`Agent "${name}" killed.`);
  },

  async tail() {
    const { apiKey, baseUrl } = getConfig();
    const params = new URLSearchParams({ key: apiKey });
    const agent = getArg('--agent');
    if (agent) params.set('agent', agent);
    console.log('Tailing live actions... (Ctrl+C to stop)\n');

    const res = await fetch(`${baseUrl}/api/v1/stream?${params}`, {
      headers: { 'Accept': 'text/event-stream' },
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        if (!part.trim()) continue;
        let eventType = '', data = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) data = line.slice(6);
        }
        if (eventType === 'heartbeat') continue;
        if (eventType === 'action.new' && data) {
          try {
            const a = JSON.parse(data);
            const status = a.status === 'success' ? '\x1b[32m✓\x1b[0m' : a.status === 'error' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m⊘\x1b[0m';
            console.log(`${status} ${pad(a.agent_name, 18)} ${pad(a.service, 12)} ${a.action} ${a.duration_ms ? `(${a.duration_ms}ms)` : ''}`);
          } catch {}
        } else if (eventType === 'alert.new' && data) {
          try {
            const a = JSON.parse(data);
            console.log(`\x1b[31m⚠ ALERT\x1b[0m [${a.severity}] ${a.message}`);
          } catch {}
        }
      }
    }
  },

  async forecast() {
    const data = await request('GET', '/api/v1/forecast');
    const f = data.forecast;
    console.log('\n  Cost Forecast');
    console.log('  ─────────────────────────────────');
    console.log(`  Projected (${f.periodDays}d):  ${formatCost(f.totalProjectedCostCents)}`);
    console.log(`  Daily Average:      ${formatCost(f.totalDailyAverageCents)}`);
    console.log('');
    if (f.agents?.length) {
      console.log(`  ${pad('Agent', 25)} ${pad('Daily Avg', 12)} ${pad('Projected', 12)} ${pad('Trend', 15)}`);
      console.log(`  ${'─'.repeat(64)}`);
      for (const a of f.agents) {
        const trendColor = a.trend === 'increasing' ? '\x1b[33m' : a.trend === 'decreasing' ? '\x1b[32m' : '';
        console.log(`  ${pad(a.agent, 25)} ${pad(formatCost(a.dailyAverageCostCents), 12)} ${pad(formatCost(a.projectedCostCents), 12)} ${trendColor}${a.trend} (${a.trendPct > 0 ? '+' : ''}${a.trendPct}%)\x1b[0m`);
      }
    }
    console.log('');
  },

  async export() {
    const from = getArg('--from');
    const to = getArg('--to');
    const format = getArg('--format') || 'json';
    if (!from || !to) { console.error('Usage: agentledger export --from 2025-01-01 --to 2025-01-31 [--format csv]'); process.exit(1); }
    const params = new URLSearchParams({ from, to, format });
    const { apiKey, baseUrl } = getConfig();
    const res = await fetch(`${baseUrl}/api/v1/export?${params}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) { console.error('Export failed'); process.exit(1); }
    if (format === 'csv') {
      process.stdout.write(await res.text());
    } else {
      console.log(JSON.stringify(await res.json(), null, 2));
    }
  },

  help() {
    console.log(`
  agentledger v${VERSION} — CLI for AgentLedger

  Usage: agentledger <command> [options]

  Commands:
    stats                  Show dashboard summary
    actions [--limit N]    List recent actions
    agents                 List all agents with status
    pause <name>           Pause an agent
    resume <name>          Resume a paused agent
    kill <name>            Kill an agent permanently
    tail [--agent name]    Live tail of actions (SSE stream)
    forecast               Show cost forecasts
    export --from --to     Export action logs (--format csv|json)
    help                   Show this help

  Environment:
    AGENTLEDGER_KEY        API key (required)
    AGENTLEDGER_URL        Base URL (default: https://agentledger.co)
`);
  },
};

// ==================== MAIN ====================
const args = process.argv.slice(2);
const command = args[0] || 'help';

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

if (command === '--version' || command === '-v') {
  console.log(VERSION);
} else if (commands[command]) {
  commands[command]().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}`);
  commands.help();
  process.exit(1);
}
