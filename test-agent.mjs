import OpenAI from 'openai';
import pkg from 'agentledger';
const { AgentLedger } = pkg;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ledger = new AgentLedger({ apiKey: process.env.AGENTLEDGER_KEY });

const { result } = await ledger.track({
  agent: 'research-bot',
  service: 'openai',
  action: 'chat_completion',
  metadata: { model: 'gpt-4o-mini' }
}, async () => {
  return await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'What are 3 benefits of retiring early?' }]
  });
});

console.log('Agent said:', result.choices[0].message.content);
console.log('✅ Logged to AgentLedger — check your dashboard');
