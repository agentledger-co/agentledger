export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'safety' | 'cost' | 'compliance' | 'development';
  policies: {
    rule_type: string;
    rule_config: Record<string, unknown>;
    priority: number;
  }[];
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Strict cost and rate limits for production environments. Low risk tolerance with approval required for high-cost actions.',
    category: 'safety',
    policies: [
      { rule_type: 'rate_limit', rule_config: { max_actions: 50, window_seconds: 60 }, priority: 100 },
      { rule_type: 'cost_limit_per_action', rule_config: { max_cost_cents: 50 }, priority: 90 },
      { rule_type: 'require_approval', rule_config: { services: [], actions: [] }, priority: 80 },
    ],
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Moderate limits suitable for staging and low-risk production workloads. Blocks known dangerous services.',
    category: 'safety',
    policies: [
      { rule_type: 'rate_limit', rule_config: { max_actions: 200, window_seconds: 60 }, priority: 100 },
      { rule_type: 'cost_limit_per_action', rule_config: { max_cost_cents: 500 }, priority: 90 },
    ],
  },
  {
    id: 'permissive',
    name: 'Permissive',
    description: 'Minimal restrictions for development and testing. High rate limits, no approval requirements.',
    category: 'development',
    policies: [
      { rule_type: 'rate_limit', rule_config: { max_actions: 1000, window_seconds: 60 }, priority: 100 },
    ],
  },
  {
    id: 'cost-conscious',
    name: 'Cost Conscious',
    description: 'Focus on cost control. Low per-action limits with service restrictions to prevent expensive API calls.',
    category: 'cost',
    policies: [
      { rule_type: 'cost_limit_per_action', rule_config: { max_cost_cents: 25 }, priority: 100 },
      { rule_type: 'rate_limit', rule_config: { max_actions: 100, window_seconds: 60 }, priority: 90 },
      { rule_type: 'service_blocklist', rule_config: { services: ['dalle', 'midjourney', 'stable-diffusion'] }, priority: 80 },
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance',
    description: 'PII protection and audit-friendly rules. Blocks sensitive patterns in payloads and requires approval for data operations.',
    category: 'compliance',
    policies: [
      { rule_type: 'payload_regex_block', rule_config: { patterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b', '\\b\\d{16}\\b', 'password\\s*[:=]', 'secret\\s*[:=]', 'api[_-]?key\\s*[:=]'] }, priority: 100 },
      { rule_type: 'rate_limit', rule_config: { max_actions: 100, window_seconds: 60 }, priority: 90 },
    ],
  },
  {
    id: 'openai-optimized',
    name: 'OpenAI Optimized',
    description: 'Tailored for OpenAI API usage. Service allowlist restricted to OpenAI, with cost limits matching typical GPT-4 pricing.',
    category: 'cost',
    policies: [
      { rule_type: 'service_allowlist', rule_config: { services: ['openai', 'openai-assistants', 'openai-embeddings'] }, priority: 100 },
      { rule_type: 'cost_limit_per_action', rule_config: { max_cost_cents: 200 }, priority: 90 },
      { rule_type: 'rate_limit', rule_config: { max_actions: 60, window_seconds: 60 }, priority: 80 },
    ],
  },
];

export function getTemplate(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: string): PolicyTemplate[] {
  return POLICY_TEMPLATES.filter(t => t.category === category);
}
