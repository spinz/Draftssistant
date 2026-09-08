import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sleeperDraftId = searchParams.get('sleeper_draft_id');

    // Read precompiled fantasy dataset
    const dataPath = path.join(process.cwd(), 'src', 'data', 'fantasy_players.json');
    let poolData = null;

    if (fs.existsSync(dataPath)) {
      const fileContent = fs.readFileSync(dataPath, 'utf-8');
      poolData = JSON.parse(fileContent);
    } else {
      return NextResponse.json(
        { error: 'Fantasy player dataset not found on server' },
        { status: 500 }
      );
    }

    let sleeperDraft = null;
    let sleeperPicks = null;

    // Optional Sleeper Draft Sync
    if (sleeperDraftId && sleeperDraftId.trim().length > 0) {
      try {
        const [draftRes, picksRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/draft/${sleeperDraftId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 0 }
          }),
          fetch(`https://api.sleeper.app/v1/draft/${sleeperDraftId}/picks`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 0 }
          })
        ]);

        if (draftRes.ok) {
          sleeperDraft = await draftRes.json();
        }
        if (picksRes.ok) {
          sleeperPicks = await picksRes.json();
        }
      } catch (e: any) {
        console.error('Failed to fetch from Sleeper API:', e?.message || e);
      }
    }

    return NextResponse.json({
      success: true,
      updated_at: poolData.updated_at,
      season: poolData.season,
      total_players: poolData.total_players,
      baselines: poolData.baselines,
      bye_map: poolData.bye_map,
      players: poolData.players,
      sleeper: sleeperDraftId ? {
        draft_id: sleeperDraftId,
        draft: sleeperDraft,
        picks: sleeperPicks || []
      } : null
    });
  } catch (error: any) {
    console.error('Error in /api/draft:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
