import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { getOrgUsageStats } from '@/lib/usage';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stats = await getOrgUsageStats(auth.orgId);
  return NextResponse.json(stats);
}
