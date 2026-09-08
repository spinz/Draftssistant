import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CONFIG_PATH = path.join(process.cwd(), 'src', 'data', 'espn_config.json');

interface EspnConfig {
  leagueId: string;
  espn_s2: string;
  swid: string;
  season?: string;
}

function loadSavedConfig(): EspnConfig | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read ESPN config:', e);
  }
  return null;
}

function saveConfig(cfg: EspnConfig) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save ESPN config:', e);
  }
}

async function fetchEspnLeagueData(leagueId: string, espn_s2: string, swid: string) {
  const seasons = ['2026', '2025'];
  let lastError = null;

  for (const season of seasons) {
    const url = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' + season + '/segments/0/leagues/' + leagueId + '?view=mSettings&view=mRoster&view=mTeam&view=mDraftDetail';
    
    // Clean SWID format (ensure curly braces)
    let cleanSwid = swid.trim();
    if (!cleanSwid.startsWith('{')) cleanSwid = '{' + cleanSwid;
    if (!cleanSwid.endsWith('}')) cleanSwid = cleanSwid + '}';

    const cookieHeader = 'espn_s2=' + espn_s2.trim() + '; SWID=' + cleanSwid + ';';

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Cookie': cookieHeader
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        return { data, season };
      } else {
        lastError = 'ESPN API returned HTTP ' + res.status + ' (' + res.statusText + ') for season ' + season;
      }
    } catch (err: any) {
      lastError = err?.message || 'Network failure connecting to ESPN API';
    }
  }

  throw new Error(lastError || 'Unable to connect to ESPN league');
}

export async function GET() {
  try {
    const saved = loadSavedConfig();

    if (!saved?.leagueId || !saved?.espn_s2 || !saved?.swid) {
      return NextResponse.json({
        configured: false,
        message: 'ESPN credentials not configured'
      });
    }

    const { leagueId, espn_s2, swid } = saved;

    const { data, season } = await fetchEspnLeagueData(leagueId, espn_s2, swid);

    // Parse league teams
    let cleanSwid = swid.trim().toUpperCase();
    if (!cleanSwid.startsWith('{')) cleanSwid = '{' + cleanSwid;
    if (!cleanSwid.endsWith('}')) cleanSwid = cleanSwid + '}';

    const teams = (data.teams || []).map((t: any) => {
      const teamName = (t.location && t.nickname) ? (t.location + ' ' + t.nickname) : (t.name || ('Team ' + t.id));
      const owners = Array.isArray(t.owners) ? t.owners : [t.primaryOwner];
      const isMyTeam = owners.some((o: string) => o && o.toUpperCase() === cleanSwid);
      return {
        id: t.id,
        name: teamName,
        abbrev: t.abbrev,
        logo: t.logo,
        owners: owners,
        isUser: isMyTeam
      };
    });

    const myTeam = teams.find((t: any) => t.isUser) || null;

    // Parse Roster Slots
    const slotCounts = data.settings?.rosterSettings?.lineupSlotCounts || {};
    const rosterConfig = {
      qb: slotCounts['0'] || 1,
      rb: slotCounts['2'] || 2,
      wr: slotCounts['4'] || 2,
      te: slotCounts['6'] || 1,
      flex: slotCounts['23'] || 1,
      k: slotCounts['17'] || 1,
      def: slotCounts['16'] || 1,
      bench: slotCounts['20'] || 6,
      superflex: slotCounts['7'] || 0
    };

    // Parse Scoring Rules
    const scoringItems = data.settings?.scoringSettings?.scoringItems || [];
    let pprValue = 0.5; // default fallback
    let passTdValue = 4;
    let rushTdValue = 6;
    let recTdValue = 6;

    scoringItems.forEach((item: any) => {
      if (item.statId === 53) pprValue = item.points; // Reception
      if (item.statId === 4) passTdValue = item.points; // Passing TD
      if (item.statId === 24) rushTdValue = item.points; // Rushing TD
      if (item.statId === 43) recTdValue = item.points; // Receiving TD
    });

    let detectedScoring: 'half' | 'ppr' | 'std' = 'half';
    if (pprValue >= 1.0) detectedScoring = 'ppr';
    else if (pprValue <= 0.0) detectedScoring = 'std';

    // Parse Draft Order & Status
    const draftDetail = data.draftDetail || {};
    const draftSettings = data.settings?.draftSettings || {};
    const pickOrder = draftSettings.pickOrder || [];

    let myDraftSlot = 1;
    if (myTeam && pickOrder.length > 0) {
      const idx = pickOrder.indexOf(myTeam.id);
      if (idx !== -1) myDraftSlot = idx + 1;
    }

    // Parse Draft Picks made
    const rawPicks = draftDetail.picks || [];
    const idToNamePath = path.join(process.cwd(), 'src', 'data', 'espn_id_to_name.json');
    let espnNameMap: Record<string, string> = {};
    try {
      if (fs.existsSync(idToNamePath)) {
        espnNameMap = JSON.parse(fs.readFileSync(idToNamePath, 'utf-8'));
      }
    } catch (_e) {}

    // Exclude confirmed future-slot sentinel value (-1) and null/undefined IDs.
    // Note: ESPN uses negative IDs (e.g., -16001 for Falcons D/ST) for real defense selections.
    const picks = rawPicks
      .filter((p: any) => p.playerId != null && Number(p.playerId) !== -1 && Number(p.playerId) !== 0)
      .map((p: any) => {
      const team = teams.find((t: any) => t.id === p.teamId);
      const pName = espnNameMap[String(p.playerId)] || null;
      let draftSlot = p.roundPickNumber;
      if (pickOrder.length > 0) {
        const slotIdx = pickOrder.indexOf(p.teamId);
        if (slotIdx !== -1) draftSlot = slotIdx + 1;
      }
      const displayName = team?.name ? `${team.name} (Slot #${draftSlot})` : `Slot #${draftSlot}`;

      return {
        overallPick: p.overallPickNumber,
        round: p.roundId,
        roundPick: p.roundPickNumber,
        teamId: p.teamId,
        draftSlot: draftSlot,
        teamName: displayName,
        playerId: p.playerId,
        playerName: pName,
        isUser: myTeam ? p.teamId === myTeam.id : false
      };
    });

    return NextResponse.json({
      configured: true,
      success: true,
      season,
      leagueId,
      leagueName: data.settings?.name || data.status?.leagueName || 'ESPN Fantasy League',
      totalTeams: teams.length,
      myTeam,
      myDraftSlot,
      teams,
      rosterConfig,
      scoring: {
        ppr: pprValue,
        detectedScoring,
        passTd: passTdValue,
        rushTd: rushTdValue,
        recTd: recTdValue
      },
      draft: {
        drafted: Boolean(draftDetail.drafted),
        inProgress: Boolean(draftDetail.inProgress),
        pickOrder,
        totalPicksMade: picks.length,
        picks
      }
    });

  } catch (error: any) {
    console.error('ESPN route error:', error);
    return NextResponse.json({
      configured: true,
      success: false,
      error: error?.message || 'Failed to fetch ESPN fantasy data'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leagueId, espn_s2, swid } = body;

    if (!leagueId || !espn_s2 || !swid) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: leagueId, espn_s2, and swid are required'
      }, { status: 400 });
    }

    // Test connection first
    const { data, season } = await fetchEspnLeagueData(leagueId, espn_s2, swid);

    // Save configuration
    saveConfig({
      leagueId: leagueId.toString().trim(),
      espn_s2: espn_s2.trim(),
      swid: swid.trim(),
      season
    });

    return NextResponse.json({
      success: true,
      message: 'ESPN League connected and saved successfully',
      leagueName: data.settings?.name || 'ESPN Fantasy League',
      season
    });

  } catch (error: any) {
    console.error('ESPN save error:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to authenticate with ESPN'
    }, { status: 400 });
  }
}
