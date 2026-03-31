import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseChain } from '../setup';

// ---------- mock supabase ----------
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

// ---------- mock webhooks & notifications (fire-and-forget) ----------
const mockFireWebhooks = vi.fn().mockResolvedValue(undefined);
const mockSendNotifications = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/webhooks', () => ({
  fireWebhooks: (...args: unknown[]) => mockFireWebhooks(...args),
}));
vi.mock('@/lib/notifications', () => ({
  sendNotifications: (...args: unknown[]) => mockSendNotifications(...args),
}));

import { checkAnomalies } from '@/lib/anomalies';

// ---------- helpers ----------
function baselineRow(metric: string, baseline: number, stddev: number, sampleSize: number, metadata?: Record<string, unknown>) {
  return { metric, baseline_value: baseline, stddev, sample_size: sampleSize, metadata: metadata ?? null };
}

// ---------- tests ----------
describe('checkAnomalies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the in-memory baseline cache by importing fresh module each test.
    // Instead we mock the cache TTL by passing a unique agent/org per test.
  });

  it('creates a cost_anomaly alert when cost > baseline + 2*stddev', async () => {
    const baselines = [
      baselineRow('cost_per_action', 100, 20, 100), // threshold = 100 + 40 = 140
    ];

    // First call: fetch baselines
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));
    // Second call: insert anomaly alerts
    const insertChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(insertChain);

    await checkAnomalies('org_cost', 'agent_cost_high', {
      service: 'openai',
      estimated_cost_cents: 200, // 200 > 140, anomaly
      duration_ms: 500,
      status: 'success',
    });

    // Verify insert was called on anomaly_alerts
    expect(mockFrom).toHaveBeenCalledWith('anomaly_alerts');
    const insertCall = (insertChain as Record<string, any>).insert;
    expect(insertCall).toHaveBeenCalled();
    const alerts = insertCall.mock.calls[0][0];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert_type).toBe('cost_anomaly');
    expect(alerts[0].severity).toMatch(/warning|critical/);
  });

  it('does not create an alert when cost is within normal range', async () => {
    const baselines = [
      baselineRow('cost_per_action', 100, 20, 100), // threshold = 140
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));

    await checkAnomalies('org_normal', 'agent_normal', {
      service: 'openai',
      estimated_cost_cents: 120, // 120 < 140, normal
      duration_ms: 500,
      status: 'success',
    });

    // Should NOT have called from('anomaly_alerts')
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).not.toContain('anomaly_alerts');
  });

  it('creates a duration_anomaly alert for high duration', async () => {
    const baselines = [
      baselineRow('duration_per_action', 500, 100, 100), // threshold = 700
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));
    const insertChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(insertChain);

    await checkAnomalies('org_dur', 'agent_slow', {
      service: 'postgres',
      estimated_cost_cents: 0,
      duration_ms: 1500, // 1500 > 700
      status: 'success',
    });

    expect(mockFrom).toHaveBeenCalledWith('anomaly_alerts');
    const alerts = (insertChain as Record<string, any>).insert.mock.calls[0][0];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert_type).toBe('duration_anomaly');
  });

  it('creates a new_service alert for unknown services', async () => {
    const baselines = [
      baselineRow('service_distribution', 0, 0, 100, { openai: 50, postgres: 30 }),
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));
    const insertChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(insertChain);

    await checkAnomalies('org_svc', 'agent_new_svc', {
      service: 'never-seen-before',
      estimated_cost_cents: 10,
      duration_ms: 100,
      status: 'success',
    });

    expect(mockFrom).toHaveBeenCalledWith('anomaly_alerts');
    const alerts = (insertChain as Record<string, any>).insert.mock.calls[0][0];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert_type).toBe('new_service');
    expect(alerts[0].metadata.new_service).toBe('never-seen-before');
  });

  it('skips anomaly check when sample_size < 50', async () => {
    const baselines = [
      baselineRow('cost_per_action', 100, 20, 10), // only 10 samples, below MIN_SAMPLE_SIZE
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));

    await checkAnomalies('org_small', 'agent_small', {
      service: 'openai',
      estimated_cost_cents: 9999, // way above threshold but should be skipped
      duration_ms: 100,
      status: 'success',
    });

    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).not.toContain('anomaly_alerts');
  });

  it('skips gracefully when no baselines exist', async () => {
    mockFrom.mockReturnValueOnce(createMockSupabaseChain([]));

    await checkAnomalies('org_empty', 'agent_empty', {
      service: 'openai',
      estimated_cost_cents: 9999,
      duration_ms: 99999,
      status: 'success',
    });

    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).not.toContain('anomaly_alerts');
  });

  it('fires webhooks and notifications for detected anomalies', async () => {
    const baselines = [
      baselineRow('cost_per_action', 100, 20, 100),
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));
    mockFrom.mockReturnValueOnce(createMockSupabaseChain(null));

    await checkAnomalies('org_hook', 'agent_hook', {
      service: 'openai',
      estimated_cost_cents: 200,
      duration_ms: 100,
      status: 'success',
    });

    expect(mockFireWebhooks).toHaveBeenCalledWith(
      'org_hook',
      'alert.created',
      expect.objectContaining({ alert_type: 'cost_anomaly' }),
    );
    expect(mockSendNotifications).toHaveBeenCalledWith(
      'org_hook',
      expect.objectContaining({ event: 'anomaly.detected' }),
    );
  });

  it('returns critical severity when deviations > 3', async () => {
    const baselines = [
      baselineRow('cost_per_action', 100, 10, 100), // threshold = 120
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));
    const insertChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(insertChain);

    await checkAnomalies('org_crit', 'agent_crit', {
      service: 'openai',
      estimated_cost_cents: 200, // deviations = (200-100)/10 = 10 > 3 => critical
      duration_ms: 100,
      status: 'success',
    });

    const alerts = (insertChain as Record<string, any>).insert.mock.calls[0][0];
    expect(alerts[0].severity).toBe('critical');
  });

  it('returns warning severity when deviations <= 3', async () => {
    const baselines = [
      baselineRow('cost_per_action', 100, 20, 100), // threshold = 140
    ];

    mockFrom.mockReturnValueOnce(createMockSupabaseChain(baselines));
    const insertChain = createMockSupabaseChain(null);
    mockFrom.mockReturnValueOnce(insertChain);

    await checkAnomalies('org_warn', 'agent_warn', {
      service: 'openai',
      estimated_cost_cents: 155, // deviations = (155-100)/20 = 2.75 <= 3 => warning
      duration_ms: 100,
      status: 'success',
    });

    const alerts = (insertChain as Record<string, any>).insert.mock.calls[0][0];
    expect(alerts[0].severity).toBe('warning');
  });
});
