import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';

const MAX_LIMIT = 10000;
const DEFAULT_LIMIT = 5000;
const MAX_DATE_RANGE_DAYS = 90;

const CSV_COLUMNS = [
  'id',
  'agent_name',
  'service',
  'action',
  'status',
  'estimated_cost_cents',
  'duration_ms',
  'trace_id',
  'environment',
  'created_at',
] as const;

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function actionsToCsv(actions: Record<string, unknown>[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = actions.map((action) =>
    CSV_COLUMNS.map((col) => escapeCsvField(action[col])).join(',')
  );
  return [header, ...rows].join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;

    const format = sanitizeString(searchParams.get('format') || 'json');
    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json(
        { error: 'Invalid format. Must be "csv" or "json".' },
        { status: 400 }
      );
    }

    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    if (!fromParam || !toParam) {
      return NextResponse.json(
        { error: 'Both "from" and "to" query parameters are required.' },
        { status: 400 }
      );
    }

    const fromDate = new Date(sanitizeString(fromParam) ?? fromParam);
    const toDate = new Date(sanitizeString(toParam) ?? toParam);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use ISO 8601 dates.' },
        { status: 400 }
      );
    }

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: '"from" date must be before "to" date.' },
        { status: 400 }
      );
    }

    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_DATE_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days.` },
        { status: 400 }
      );
    }

    let limit = DEFAULT_LIMIT;
    const limitParam = searchParams.get('limit');
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'Invalid limit. Must be a positive integer.' },
          { status: 400 }
        );
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    const agent = searchParams.get('agent');
    const service = searchParams.get('service');
    const status = searchParams.get('status');
    const environment = searchParams.get('environment');

    const supabase = createServiceClient();

    let query = supabase
      .from('action_logs')
      .select('*')
      .eq('org_id', auth.orgId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(limit);

    if (agent) {
      query = query.eq('agent_name', sanitizeString(agent));
    }
    if (service) {
      query = query.eq('service', sanitizeString(service));
    }
    if (status) {
      query = query.eq('status', sanitizeString(status));
    }
    if (environment) {
      query = query.eq('environment', sanitizeString(environment));
    }

    const { data: actions, error } = await query;

    if (error) {
      console.error('Export query error:', error);
      return NextResponse.json(
        { error: 'Failed to query action logs.' },
        { status: 500 }
      );
    }

    const results = actions ?? [];

    if (format === 'csv') {
      const csv = actionsToCsv(results);
      const dateStr = new Date().toISOString().split('T')[0];
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="agentledger-export-${dateStr}.csv"`,
        },
      });
    }

    return NextResponse.json({
      export: {
        format: 'json',
        count: results.length,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        generated_at: new Date().toISOString(),
      },
      actions: results,
    });
  } catch (err) {
    console.error('Export endpoint error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
