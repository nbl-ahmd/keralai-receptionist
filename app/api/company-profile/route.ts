import { NextResponse } from 'next/server';
import { getProfile, saveProfile } from '@/lib/store';

export async function GET() {
  try {
    return NextResponse.json(await getProfile());
  } catch (error) {
    console.error('[api/company-profile] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read profile' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await request.json();
    const saved = await saveProfile(profile);
    return NextResponse.json({ success: true, profile: saved });
  } catch (error) {
    console.error('[api/company-profile] POST failed:', error);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}