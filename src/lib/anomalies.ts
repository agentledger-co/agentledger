import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';
import { sendNotifications } from '@/lib/notifications';

// In-memory cache for baselines (5 min TTL)
const baselineCache = new Map<string, { baselines: Record<string, Baseline>; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_SAMPLE_SIZE = 50;

interface Baseline {
  baseline_value: number;
  stddev: number;
  sample_size: number;
  metadata?: Record<string, unknown>;
}

interface ActionData {
  service: string;
  estimated_cost_cents: number;
  duration_ms: number;
  status: string;
}

interface AnomalyAlert {
  org_id: string;
  agent_name: string;
  alert_type: string;
  severity: 'warning' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
}

async function getBaselines(orgId: string, agentName: string): Promise<Record<string, Baseline>> {
  const cacheKey = `${orgId}:${agentName}`;
  const cached = baselineCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.baselines;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agent_baselines')
    .select('metric, baseline_value, stddev, sample_size, metadata')
    .eq('org_id', orgId)
    .eq('agent_name', agentName);

  if (error || !data) {
    return {};
  }

  const baselines: Record<string, Baseline> = {};
  for (const row of data) {
    baselines[row.metric] = {
      baseline_value: Number(row.baseline_value),
      stddev: Number(row.stddev),
      sample_size: row.sample_size,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  baselineCache.set(cacheKey, { baselines, timestamp: Date.now() });
  return baselines;
}

function computeSeverity(deviations: number): 'warning' | 'critical' {
  return deviations > 3 ? 'critical' : 'warning';
}

export async function checkAnomalies(
  orgId: string,
  agentName: string,
  action: ActionData
): Promise<void> {
  const baselines = await getBaselines(orgId, agentName);
  const alerts: AnomalyAlert[] = [];

  // Check cost_per_action
  const costBaseline = baselines['cost_per_action'];
  if (costBaseline && costBaseline.sample_size >= MIN_SAMPLE_SIZE && costBaseline.stddev > 0) {
    const costValue = action.estimated_cost_cents;
    const threshold = costBaseline.baseline_value + 2 * costBaseline.stddev;
    if (costValue > threshold) {
      const deviations = (costValue - costBaseline.baseline_value) / costBaseline.stddev;
      const ratio = costBaseline.baseline_value > 0
        ? (costValue / costBaseline.baseline_value).toFixed(1)
        : 'N/A';
      alerts.push({
        org_id: orgId,
        agent_name: agentName,
        alert_type: 'cost_anomaly',
        severity: computeSeverity(deviations),
        message: `Cost of $${(costValue / 100).toFixed(2)} is ${ratio}x the baseline of $${(costBaseline.baseline_value / 100).toFixed(2)} for agent ${agentName}`,
        metadata: {
          metric: 'cost_per_action',
          value: costValue,
          baseline: costBaseline.baseline_value,
          stddev: costBaseline.stddev,
          deviations: Math.round(deviations * 10) / 10,
        },
      });
    }
  }

  // Check duration_per_action
  const durationBaseline = baselines['duration_per_action'];
  if (durationBaseline && durationBaseline.sample_size >= MIN_SAMPLE_SIZE && durationBaseline.stddev > 0) {
    const durationValue = action.duration_ms;
    const threshold = durationBaseline.baseline_value + 2 * durationBaseline.stddev;
    if (durationValue > threshold) {
      const deviations = (durationValue - durationBaseline.baseline_value) / durationBaseline.stddev;
      const ratio = durationBaseline.baseline_value > 0
        ? (durationValue / durationBaseline.baseline_value).toFixed(1)
        : 'N/A';
      alerts.push({
        org_id: orgId,
        agent_name: agentName,
        alert_type: 'duration_anomaly',
        severity: computeSeverity(deviations),
        message: `Duration of ${durationValue}ms is ${ratio}x the baseline of ${Math.round(durationBaseline.baseline_value)}ms for agent ${agentName}`,
        metadata: {
          metric: 'duration_per_action',
          value: durationValue,
          baseline: durationBaseline.baseline_value,
          stddev: durationBaseline.stddev,
          deviations: Math.round(deviations * 10) / 10,
        },
      });
    }
  }

  // Check for new/unknown service
  const serviceBaseline = baselines['service_distribution'];
  if (serviceBaseline && serviceBaseline.sample_size >= MIN_SAMPLE_SIZE && serviceBaseline.metadata) {
    const knownServices = serviceBaseline.metadata as Record<string, number>;
    if (!knownServices[action.service]) {
      alerts.push({
        org_id: orgId,
        agent_name: agentName,
        alert_type: 'new_service',
        severity: 'warning',
        message: `Agent ${agentName} is using a previously unseen service: ${action.service}`,
        metadata: {
          metric: 'service_distribution',
          new_service: action.service,
          known_services: Object.keys(knownServices),
        },
      });
    }
  }

  // Insert all detected anomaly alerts
  if (alerts.length > 0) {
    const supabase = createServiceClient();
    await supabase.from('anomaly_alerts').insert(alerts);

    // Fire webhooks and notifications for each alert (non-blocking)
    for (const alert of alerts) {
      fireWebhooks(orgId, 'alert.created', {
        agent: agentName,
        alert_type: alert.alert_type,
        severity: alert.severity,
        message: alert.message,
      }).catch(() => {});

      sendNotifications(orgId, {
        event: 'anomaly.detected',
        agentName,
        message: alert.message,
        details: alert.metadata as Record<string, string>,
      }).catch(() => {});
    }
  }
}
