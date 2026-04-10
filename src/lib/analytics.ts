// Centralized Google Analytics event tracking
// All custom events for AgentLedger

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function track(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// ---- Authentication & Onboarding ----
export const analytics = {
  // Signup & Login
  signup: (method: 'email' | 'github') => track('sign_up', { method }),
  login: (method: 'email' | 'github' | 'magic_link') => track('login', { method }),

  // Onboarding
  workspaceCreated: (name: string) => track('workspace_created', { workspace_name: name }),
  apiKeyCopied: () => track('api_key_copied'),
  testEventSent: (success: boolean) => track('test_event_sent', { success }),
  onboardingCompleted: () => track('onboarding_completed'),
  onboardingSkipped: () => track('onboarding_skipped'),

  // ---- Agent Management ----
  agentPaused: (agent: string) => track('agent_paused', { agent_name: agent }),
  agentResumed: (agent: string) => track('agent_resumed', { agent_name: agent }),
  agentKilled: (agent: string) => track('agent_killed', { agent_name: agent }),

  // ---- Policies ----
  policyCreated: (ruleType: string) => track('policy_created', { rule_type: ruleType }),
  policyToggled: (enabled: boolean) => track('policy_toggled', { enabled }),
  policyDeleted: () => track('policy_deleted'),
  policyTemplateApplied: (templateId: string) => track('policy_template_applied', { template_id: templateId }),

  // ---- Approvals ----
  approvalDecided: (decision: 'approved' | 'denied') => track('approval_decided', { decision }),

  // ---- Budgets ----
  budgetCreated: () => track('budget_created'),
  budgetReset: () => track('budget_reset'),
  budgetDeleted: () => track('budget_deleted'),

  // ---- Webhooks ----
  webhookCreated: () => track('webhook_created'),
  webhookToggled: (active: boolean) => track('webhook_toggled', { active }),
  webhookDeleted: () => track('webhook_deleted'),
  channelSaved: (type: 'slack' | 'email') => track('channel_saved', { channel_type: type }),

  // ---- Rollback Hooks ----
  rollbackHookCreated: () => track('rollback_hook_created'),
  rollbackHookToggled: (enabled: boolean) => track('rollback_hook_toggled', { enabled }),
  rollbackHookDeleted: () => track('rollback_hook_deleted'),

  // ---- API Keys ----
  apiKeyCreated: () => track('api_key_created'),
  apiKeyRotated: () => track('api_key_rotated'),
  apiKeyRevoked: () => track('api_key_revoked'),

  // ---- Team ----
  teamInviteSent: (role: string) => track('team_invite_sent', { role }),
  teamMemberRemoved: () => track('team_member_removed'),
  teamRoleChanged: (newRole: string) => track('team_role_changed', { new_role: newRole }),

  // ---- Dashboard Navigation ----
  tabViewed: (tab: string) => track('tab_viewed', { tab_name: tab }),
  dashboardRefreshed: () => track('dashboard_refreshed'),

  // ---- Landing Page ----
  ctaClicked: (location: string) => track('cta_clicked', { location }),
  demoTabClicked: (tab: string) => track('demo_tab_clicked', { tab }),
  npmCommandCopied: () => track('npm_command_copied'),
  faqOpened: (index: number) => track('faq_opened', { faq_index: index }),
  scrollDepth: (percent: 25 | 50 | 75 | 100) => track('scroll_depth', { percent }),

  // ---- Engagement ----
  // Fired every 30s while a dashboard tab is in focus. Offsets GA4's
  // focus-only engagement timer, which undercounts dashboard tools that
  // users leave open in the background.
  dashboardHeartbeat: () => track('dashboard_heartbeat'),
};
