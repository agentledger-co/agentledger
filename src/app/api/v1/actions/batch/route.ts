import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';
import { checkUsageLimits, checkRateLimit } from '@/lib/usage';
import { sanitizeString, sanitizeMetadata, sanitizePayload, sanitizePositiveInt, validateStatus } from '@/lib/validate';

const MAX_BATCH_SIZE = 100;

interface ActionInput {
  agent?: string;
  service?: string;
  action?: string;
  status?: string;
  cost_cents?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  trace_id?: string;
  environment?: string;
  input?: unknown;
  output?: unknown;
}

interface ProcessedAction {
  org_id: string;
  agent: string;
  service: string | null;
  action: string;
  status: string;
  cost_cents: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  trace_id: string | null;
  environment: string | null;
  input: unknown | null;
  output: unknown | null;
}

interface ActionError {
  index: number;
  errors: string[];
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateApiKey(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Usage limit check (once for the batch)
    const usageCheck = await checkUsageLimits(auth.orgId);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: usageCheck.reason, usage: usageCheck.usage },
        { status: 403 }
      );
    }

    // Rate limit check (once for the batch)
    const rateCheck = checkRateLimit(auth.orgId, usageCheck.plan);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please slow down.', retryAfter: rateCheck.retryAfter },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { actions } = body;

    if (!Array.isArray(actions)) {
      return NextResponse.json(
        { error: 'Request body must contain an "actions" array' },
        { status: 400 }
      );
    }

    if (actions.length === 0) {
      return NextResponse.json(
        { error: 'Actions array must not be empty' },
        { status: 400 }
      );
    }

    if (actions.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} actions` },
        { status: 400 }
      );
    }

    // Process and validate each action
    const validActions: ProcessedAction[] = [];
    const errors: ActionError[] = [];

    for (let i = 0; i < actions.length; i++) {
      const raw: ActionInput = actions[i];
      const actionErrors: string[] = [];

      // Validate required fields
      if (!raw.agent || typeof raw.agent !== 'string') {
        actionErrors.push('agent is required and must be a string');
      }
      if (!raw.action || typeof raw.action !== 'string') {
        actionErrors.push('action is required and must be a string');
      }
      if (!raw.status || typeof raw.status !== 'string') {
        actionErrors.push('status is required and must be a string');
      } else if (!validateStatus(raw.status)) {
        actionErrors.push('status must be one of: success, error, pending, skipped, denied');
      }

      if (actionErrors.length > 0) {
        errors.push({ index: i, errors: actionErrors });
        continue;
      }

      // Sanitize inputs
      const processed: ProcessedAction = {
        org_id: auth.orgId,
        agent: sanitizeString(raw.agent!) ?? raw.agent!,
        service: raw.service ? sanitizeString(raw.service) : null,
        action: sanitizeString(raw.action!) ?? raw.action!,
        status: sanitizeString(raw.status!) ?? raw.status!,
        cost_cents: raw.cost_cents != null ? sanitizePositiveInt(raw.cost_cents) : null,
        duration_ms: raw.duration_ms != null ? sanitizePositiveInt(raw.duration_ms) : null,
        metadata: raw.metadata ? sanitizeMetadata(raw.metadata) : null,
        trace_id: raw.trace_id ? sanitizeString(raw.trace_id) : null,
        environment: raw.environment ? sanitizeString(raw.environment) : null,
        input: raw.input ? sanitizePayload(raw.input) : null,
        output: raw.output ? sanitizePayload(raw.output) : null,
      };

      validActions.push(processed);
    }

    // If no valid actions, return errors only
    if (validActions.length === 0) {
      return NextResponse.json(
        { logged: false, count: 0, ids: [], errors },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Insert all action_logs in one call
    const { data: inserted, error: insertError } = await supabase
      .from('action_logs')
      .insert(validActions)
      .select('id');

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to insert action logs', details: insertError.message },
        { status: 500 }
      );
    }

    const ids = inserted?.map((row: { id: string }) => row.id) ?? [];

    // Upsert unique agents
    const uniqueAgents = [...new Set(validActions.map((a) => a.agent))];
    const agentUpserts = uniqueAgents.map((agent) => ({
      org_id: auth.orgId,
      name: agent,
    }));

    await supabase
      .from('agents')
      .upsert(agentUpserts, { onConflict: 'org_id,name' });

    // Fire webhooks for batch.logged event (non-blocking)
    fireWebhooks(auth.orgId, 'batch.logged', {
      count: validActions.length,
      agents: uniqueAgents,
    });

    const response: Record<string, unknown> = {
      logged: true,
      count: ids.length,
      ids,
    };

    if (errors.length > 0) {
      response.errors = errors;
    }

    return NextResponse.json(response, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
