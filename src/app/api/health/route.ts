import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/health — Health check endpoint.
 * Returns 200 if the app and database are reachable.
 * Use with uptime monitors (UptimeRobot, Betterstack, etc.)
 */
export async function GET() {
  const start = Date.now();

  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    const dbOk = !error;
    const latencyMs = Date.now() - start;

    if (!dbOk) {
      return NextResponse.json(
        { status: 'degraded', db: false, error: error.message, latencyMs },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      db: true,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', db: false, error: err instanceof Error ? err.message : 'Unknown' },
      { status: 503 }
    );
  }
}
