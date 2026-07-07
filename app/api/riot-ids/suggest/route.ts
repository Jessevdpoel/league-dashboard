import { NextResponse } from 'next/server';
import { isPlatformRegion } from '@/lib/riot/regions';
import { suggestRiotIds } from '@/lib/riotIdIndexStore';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const region = searchParams.get('region') ?? '';
  if (!isPlatformRegion(region) || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }
  try {
    return NextResponse.json({ suggestions: await suggestRiotIds(region, q) });
  } catch (error) {
    // Autocomplete is best-effort: an index outage must not break the search box.
    console.error('riot id suggest failed', error);
    return NextResponse.json({ suggestions: [] });
  }
}
