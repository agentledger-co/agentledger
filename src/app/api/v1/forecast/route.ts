import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { sanitizeString } from '@/lib/validate';
import { generateForecast } from '@/lib/forecasting';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysBack = Math.min(Math.max(parseInt(url.searchParams.get('days_back') || '30') || 30, 7), 90);
  const forecastDays = Math.min(Math.max(parseInt(url.searchParams.get('forecast_days') || '30') || 30, 7), 90);
  const environment = sanitizeString(url.searchParams.get('environment') ?? undefined);

  const forecast = await generateForecast(auth.orgId, daysBack, forecastDays, environment || undefined);

  return NextResponse.json({ forecast });
}
