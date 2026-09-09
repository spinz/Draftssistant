'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  Zap,
  Flame,
  CheckCircle2,
  RotateCcw,
  Search,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Trophy,
  X,
  Check,
  HelpCircle,
  Info
} from 'lucide-react';

interface Player {
  id: string;
  espn_id?: string;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'FLEX';
  team: string;
  bye: number;
  search_rank: number;
  adp_ppr: number;
  adp_half: number;
  adp_std: number;
  pts_ppr: number;
  pts_half: number;
  pts_std: number;
  injury: string | null;
  age: number | null;
  years_exp: number;
  depth: number;
  pos_rank: string;
  pos_rank_num: number;
  vorp_ppr: number;
  vorp_half: number;
  vorp_std: number;
  tier: number;
}

interface PickRecord {
  pickNo: number;
  round: number;
  pickInRound: number;
  teamSlot: number;
  teamName?: string;
  isUser: boolean;
  player: Player;
  timestamp: string;
}

type ScoringMode = 'half' | 'ppr' | 'std';

export default function DraftWarRoom() {
  // Config state
  const [userSlot, setUserSlot] = useState<number>(1);
  const [numTeams, setNumTeams] = useState<number>(12);
  const [scoring, setScoring] = useState<ScoringMode>('half');
  const [rosterFormat, setRosterFormat] = useState<'2wr' | '3wr'>('2wr');

  // ESPN state
  const [espnModalOpen, setEspnModalOpen] = useState<boolean>(false);
  const [espnConfigured, setEspnConfigured] = useState<boolean>(false);
  const [espnLeagueName, setEspnLeagueName] = useState<string>('');
  const [espnMyTeamName, setEspnMyTeamName] = useState<string>('');
  const [espnAutoSync, setEspnAutoSync] = useState<boolean>(false);
  const [espnLoading, setEspnLoading] = useState<boolean>(false);
  const [espnError, setEspnError] = useState<string>('');
  const [espnLastSync, setEspnLastSync] = useState<string>('');
  
  // ESPN Form inputs
  const [inputLeagueId, setInputLeagueId] = useState<string>('');
  const [inputEspnS2, setInputEspnS2] = useState<string>('');
  const [inputSwid, setInputSwid] = useState<string>('');

  // Data state
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [espnSyncErrors, setEspnSyncErrors] = useState<number>(0);

  // ESPN Sync Health State
  // gray: unconfigured OR live sync intentionally paused
  // green: live sync enabled AND recent polls succeeding (< 2 errors)
  // red: live sync enabled AND at least 2 consecutive failures
  const syncState: 'unconfigured' | 'paused' | 'healthy' | 'degraded' | 'lost' = useMemo(() => {
    if (!espnConfigured) return 'unconfigured';
    if (!espnAutoSync) return 'paused';
    if (espnSyncErrors >= 4) return 'lost';
    if (espnSyncErrors >= 2) return 'degraded';
    return 'healthy';
  }, [espnConfigured, espnAutoSync, espnSyncErrors]);

  // Keep manual drafting actions enabled at all times during draft
  const isSyncHealthy = false;
  const syncLockedTooltip =
    'Live Sync is active — picks are logged automatically from ESPN. Pause sync to draft manually.';

  // Draft active state
  const [draftHistory, setDraftHistory] = useState<PickRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPos, setSelectedPos] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'vorp' | 'adp' | 'pts'>('vorp');

  // Load initial player data with retry support
  const loadPlayerData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await fetch('/api/draft');
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.success && Array.isArray(data.players)) {
        setAllPlayers(data.players);
      } else {
        throw new Error(data.error || 'Invalid player data response');
      }
    } catch (err: any) {
      console.error('Failed to load fantasy dataset:', err);
      setLoadError('Failed to load fantasy player dataset. Click to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlayerData();
  }, [loadPlayerData]);

  // Check saved ESPN configuration on load
  useEffect(() => {
    async function checkEspn() {
      try {
        const res = await fetch('/api/espn');
        const data = await res.json();
        if (data.configured && data.success) {
          setEspnConfigured(true);
          setEspnLeagueName(data.leagueName || 'ESPN League');
          if (data.totalTeams && typeof data.totalTeams === 'number') {
            setNumTeams(data.totalTeams);
          }
          if (data.myTeam) setEspnMyTeamName(data.myTeam.name);
          if (data.myDraftSlot) {
            setUserSlot(data.myDraftSlot);
            try { localStorage.setItem('warroom_slot', data.myDraftSlot.toString()); } catch (_e) {}
          }
          if (data.scoring?.detectedScoring) {
            setScoring(data.scoring.detectedScoring);
            try { localStorage.setItem('warroom_scoring', data.scoring.detectedScoring); } catch (_e) {}
          }
          if (data.rosterConfig?.wr >= 3) {
            setRosterFormat('3wr');
            try { localStorage.setItem('warroom_format', '3wr'); } catch (_e) {}
          } else {
            setRosterFormat('2wr');
            try { localStorage.setItem('warroom_format', '2wr'); } catch (_e) {}
          }
          setEspnAutoSync(true);
        }
      } catch (e) {
        console.error('Error checking ESPN config:', e);
      }
    }
    checkEspn();
  }, []);

  // LocalStorage restoration
  useEffect(() => {
    try {
      const savedSlot = localStorage.getItem('warroom_slot');
      if (savedSlot) setUserSlot(parseInt(savedSlot, 10));

      const savedScoring = localStorage.getItem('warroom_scoring');
      if (savedScoring && ['half', 'ppr', 'std'].includes(savedScoring)) {
        setScoring(savedScoring as ScoringMode);
      }

      const savedFormat = localStorage.getItem('warroom_format');
      if (savedFormat && ['2wr', '3wr'].includes(savedFormat)) {
        setRosterFormat(savedFormat as '2wr' | '3wr');
      }

      const savedHistory = localStorage.getItem('warroom_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.filter(p => p && p.player && p.player.id && p.player.id !== 'espn--1' && p.player.id !== 'espn-0');
          setDraftHistory(sanitized);
        }
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('warroom_slot', userSlot.toString());
      localStorage.setItem('warroom_scoring', scoring);
      localStorage.setItem('warroom_format', rosterFormat);
      localStorage.setItem('warroom_history', JSON.stringify(draftHistory));
    } catch (_e) {}
  }, [userSlot, scoring, rosterFormat, draftHistory]);

  // Drafted player IDs
  const draftedPlayerIds = useMemo(() => {
    return new Set(draftHistory.map(p => p.player.id));
  }, [draftHistory]);

  // My drafted players
  const myRoster = useMemo(() => {
    return draftHistory.filter(p => p.isUser).map(p => p.player);
  }, [draftHistory]);

  // Current overall pick number (1-indexed)
  const currentPick = draftHistory.length + 1;

  // Turn details
  const currentRound = Math.floor((currentPick - 1) / numTeams) + 1;
  const pickInCurrentRound = ((currentPick - 1) % numTeams) + 1;
  const currentTeamSlot = currentRound % 2 === 1 ? pickInCurrentRound : numTeams - pickInCurrentRound + 1;
  const isMyTurn = currentTeamSlot === userSlot;

  // Helper to calculate team at pick
  const getTeamAtPick = useCallback((pickNum: number) => {
    const round = Math.floor((pickNum - 1) / numTeams) + 1;
    const pickInRound = ((pickNum - 1) % numTeams) + 1;
    return round % 2 === 1 ? pickInRound : numTeams - pickInRound + 1;
  }, [numTeams]);

  // Calculate next user pick number
  const nextUserPick = useMemo(() => {
    for (let p = currentPick + (isMyTurn ? 1 : 0); p <= 240; p++) {
      if (getTeamAtPick(p) === userSlot) {
        return p;
      }
    }
    return currentPick + 12;
  }, [currentPick, isMyTurn, getTeamAtPick, userSlot]);

  const picksUntilTurn = isMyTurn ? 0 : nextUserPick - currentPick;

  // Available players
  const availablePlayers = useMemo(() => {
    return allPlayers
      .filter(p => !draftedPlayerIds.has(p.id))
      .map(p => {
        let pts = p.pts_half;
        let vorp = p.vorp_half;
        let adp = p.adp_half;

        if (scoring === 'ppr') {
          pts = p.pts_ppr;
          vorp = p.vorp_ppr;
          adp = p.adp_ppr;
        } else if (scoring === 'std') {
          pts = p.pts_std;
          vorp = p.vorp_std;
          adp = p.adp_std;
        }

        return {
          ...p,
          currentPts: pts,
          currentVorp: vorp,
          currentAdp: adp,
          adpValueDiff: Math.round((currentPick - adp) * 10) / 10
        };
      });
  }, [allPlayers, draftedPlayerIds, scoring, currentPick]);

  // ESPN Live Pick Polling
  useEffect(() => {
    if (!espnAutoSync || !espnConfigured) return;
    let isMounted = true;

    async function pollEspn() {
      try {
        const res = await fetch('/api/espn');
        if (!res.ok) {
          setEspnSyncErrors(prev => prev + 1);
          return;
        }
        const data = await res.json();
        if (!isMounted) return;

        if (data.success && data.draft?.picks) {
          setEspnLastSync(new Date().toLocaleTimeString());
          // Exclude confirmed future-slot sentinel (-1) and 0/null; keep negative IDs for real D/ST entries (e.g. -16001)
          const espnPicks = (data.draft.picks as any[]).filter(
            (ep: any) => ep.playerId != null && Number(ep.playerId) !== -1 && Number(ep.playerId) !== 0
          );

          // If draft order was just revealed/updated
          if (data.myDraftSlot && data.myDraftSlot !== userSlot) {
            setUserSlot(data.myDraftSlot);
          }

          // Build fast player lookup maps (by espn_id and by normalized name)
          const byEspnId = new Map<string, Player>();
          const byNormName = new Map<string, Player>();

          allPlayers.forEach(p => {
            if (p.espn_id) byEspnId.set(p.espn_id, p);
            const clean = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            byNormName.set(clean, p);
          });

          const newHistory: PickRecord[] = [];

          espnPicks.forEach((ep: any) => {
            let matchedPlayer: Player | undefined = byEspnId.get(String(ep.playerId));
            if (!matchedPlayer && ep.playerName) {
              const clean = ep.playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
              matchedPlayer = byNormName.get(clean);
            }

            // Fallback placeholder for unmatched players to keep draft turn math authoritative
            if (!matchedPlayer) {
              const isDefense = String(ep.playerId).startsWith('-16');
              matchedPlayer = {
                id: 'espn-' + ep.playerId,
                espn_id: String(ep.playerId),
                name: ep.playerName || (isDefense ? 'D/ST #' + ep.playerId : 'Player #' + ep.playerId),
                pos: isDefense ? 'DEF' : 'FLEX',
                team: isDefense ? (ep.playerName?.split(' ')[0] || 'NFL') : 'NFL',
                bye: 0,
                search_rank: 9999,
                adp_ppr: 999,
                adp_half: 999,
                adp_std: 999,
                pts_ppr: 0,
                pts_half: 0,
                pts_std: 0,
                injury: null,
                age: null,
                years_exp: 0,
                depth: 99,
                pos_rank: isDefense ? 'DEF' : 'BN',
                pos_rank_num: 99,
                vorp_ppr: 0,
                vorp_half: 0,
                vorp_std: 0,
                tier: 6
              };
            }

            newHistory.push({
              pickNo: ep.overallPick,
              round: ep.round,
              pickInRound: ep.roundPick,
              teamSlot: ep.draftSlot || ep.teamId,
              teamName: ep.teamName || ('Slot #' + (ep.draftSlot || ep.teamId)),
              isUser: ep.isUser,
              player: matchedPlayer,
              timestamp: new Date().toLocaleTimeString()
            });
          });

          // Authoritative snapshot reconciliation: updates if count, players, or order differ
          setDraftHistory(prev => {
            // CRITICAL GUARD: If ESPN reports 0 picks but local state has picks,
            // DO NOT wipe out picks! ESPN read API is cached/lagging during active draft.
            if (newHistory.length === 0 && prev.length > 0) {
              return prev;
            }

            // If ESPN has some picks, but user is ahead (manual picks made while ESPN lags),
            // reconcile the known ESPN picks and keep the manual picks ahead of it.
            if (newHistory.length > 0 && newHistory.length < prev.length) {
              const merged = [...newHistory, ...prev.slice(newHistory.length)];
              return merged;
            }

            const hasChanged = newHistory.length !== prev.length ||
              newHistory.some((np, idx) => {
                const op = prev[idx];
                return !op || op.pickNo !== np.pickNo || op.player.id !== np.player.id || op.teamSlot !== np.teamSlot;
              });
            return hasChanged ? newHistory : prev;
          });

          setEspnSyncErrors(0);
        } else {
          setEspnSyncErrors(prev => prev + 1);
        }
      } catch (err) {
        console.warn('ESPN polling error:', err);
        setEspnSyncErrors(prev => prev + 1);
      }
    }

    pollEspn();
    const interval = setInterval(pollEspn, 3500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [espnAutoSync, espnConfigured, allPlayers, userSlot, draftHistory.length]);

  // Handle ESPN Form submission
  const handleConnectEspn = async (e: React.FormEvent) => {
    e.preventDefault();
    setEspnLoading(true);
    setEspnError('');

    try {
      const res = await fetch('/api/espn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId: inputLeagueId.trim(),
          espn_s2: inputEspnS2.trim(),
          swid: inputSwid.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setEspnConfigured(true);
        setEspnLeagueName(data.leagueName || 'ESPN League');
        setEspnModalOpen(false);

        // Refresh detailed league settings
        const detailRes = await fetch('/api/espn');
        const detail = await detailRes.json();
        if (detail.success) {
          if (detail.totalTeams && typeof detail.totalTeams === 'number') {
            setNumTeams(detail.totalTeams);
          }
          if (detail.myTeam) setEspnMyTeamName(detail.myTeam.name);
          if (detail.myDraftSlot) setUserSlot(detail.myDraftSlot);
          if (detail.scoring?.detectedScoring) setScoring(detail.scoring.detectedScoring);
          if (detail.rosterConfig?.wr >= 3) setRosterFormat('3wr');
          setEspnAutoSync(true);
        }
      } else {
        setEspnError(data.error || 'Failed to authenticate with ESPN');
      }
    } catch (err: any) {
      setEspnError(err?.message || 'Connection failed');
    } finally {
      setEspnLoading(false);
    }
  };

  // Audio turn chime
  useEffect(() => {
    if (isMyTurn && typeof window !== 'undefined') {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch (_e) {}
    }
  }, [isMyTurn]);

  // Roster counts
  const rosterCounts = useMemo(() => {
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, FLEX: 0 };
    myRoster.forEach(p => {
      if (counts[p.pos] !== undefined) counts[p.pos]++;
    });
    return counts;
  }, [myRoster]);

  // Lineup mapping
  const structuredRoster = useMemo(() => {
    const targetWRs = rosterFormat === '3wr' ? 3 : 2;
    const roster = {
      qb: null as Player | null,
      rbs: [] as Player[],
      wrs: [] as Player[],
      te: null as Player | null,
      flex: null as Player | null,
      k: null as Player | null,
      def: null as Player | null,
      bench: [] as Player[]
    };

    const unassigned = [...myRoster];

    const qbIdx = unassigned.findIndex(p => p.pos === 'QB');
    if (qbIdx !== -1) roster.qb = unassigned.splice(qbIdx, 1)[0];

    for (let i = 0; i < 2; i++) {
      const idx = unassigned.findIndex(p => p.pos === 'RB');
      if (idx !== -1) roster.rbs.push(unassigned.splice(idx, 1)[0]);
    }

    for (let i = 0; i < targetWRs; i++) {
      const idx = unassigned.findIndex(p => p.pos === 'WR');
      if (idx !== -1) roster.wrs.push(unassigned.splice(idx, 1)[0]);
    }

    const teIdx = unassigned.findIndex(p => p.pos === 'TE');
    if (teIdx !== -1) roster.te = unassigned.splice(teIdx, 1)[0];

    const flexIdx = unassigned.findIndex(p => ['RB', 'WR', 'TE'].includes(p.pos));
    if (flexIdx !== -1) roster.flex = unassigned.splice(flexIdx, 1)[0];

    const kIdx = unassigned.findIndex(p => p.pos === 'K');
    if (kIdx !== -1) roster.k = unassigned.splice(kIdx, 1)[0];

    const defIdx = unassigned.findIndex(p => p.pos === 'DEF');
    if (defIdx !== -1) roster.def = unassigned.splice(defIdx, 1)[0];

    roster.bench = unassigned;
    return roster;
  }, [myRoster, rosterFormat]);

  const totalRosterPoints = useMemo(() => {
    return myRoster.reduce((sum, p) => {
      const pts = scoring === 'ppr' ? p.pts_ppr : scoring === 'std' ? p.pts_std : p.pts_half;
      return sum + pts;
    }, 0);
  }, [myRoster, scoring]);

  const byeConflicts = useMemo(() => {
    const map: Record<number, Player[]> = {};
    myRoster.forEach(p => {
      if (p.bye > 0) {
        if (!map[p.bye]) map[p.bye] = [];
        map[p.bye].push(p);
      }
    });
    return map;
  }, [myRoster]);

  // AI Recommendations
  const recommendations = useMemo(() => {
    if (availablePlayers.length === 0) return [];

    const recs: {
      type: 'vorp' | 'scarcity' | 'need';
      title: string;
      badge: string;
      player: (typeof availablePlayers)[0];
      rationale: string;
      secondaryNote: string;
      color: string;
    }[] = [];

    const validPool = currentRound <= 9 
      ? availablePlayers.filter(p => p.pos !== 'K' && p.pos !== 'DEF')
      : availablePlayers;

    // 1. VORP King
    const sortedByVorp = [...validPool].sort((a, b) => {
      let adjA = a.currentVorp;
      let adjB = b.currentVorp;

      if (a.pos === 'QB' && rosterCounts.QB >= 1) adjA -= 35;
      if (b.pos === 'QB' && rosterCounts.QB >= 1) adjB -= 35;
      if (a.pos === 'TE' && rosterCounts.TE >= 1) adjA -= 25;
      if (b.pos === 'TE' && rosterCounts.TE >= 1) adjB -= 25;
      if (a.pos === 'RB' && rosterCounts.RB >= 4) adjA -= 20;
      if (b.pos === 'RB' && rosterCounts.RB >= 4) adjB -= 20;

      return adjB - adjA;
    });

    const bestVorp = sortedByVorp[0];
    if (bestVorp) {
      const adpDiff = bestVorp.adpValueDiff;
      const adpMsg = adpDiff > 3 ? '+' + adpDiff.toFixed(1) + ' picks of ADP value' : 'Near consensus ADP (' + bestVorp.currentAdp + ')';

      recs.push({
        type: 'vorp',
        title: 'Mathematical VORP King',
        badge: 'OPTIMAL VALUE',
        player: bestVorp,
        rationale: 'Generates +' + bestVorp.currentVorp + ' pts over positional replacement. Top mathematical edge on the board.',
        secondaryNote: bestVorp.pos_rank + ' | ' + adpMsg + ' | Bye Wk ' + bestVorp.bye,
        color: 'emerald'
      });
    }

    // 2. Tier Cliff Alert
    const pickGap = isMyTurn ? (nextUserPick - currentPick) : picksUntilTurn;
    const positionsToCheck: ('RB' | 'WR' | 'TE' | 'QB')[] = ['RB', 'WR', 'TE', 'QB'];
    let topCliffCandidate: {
      player: (typeof availablePlayers)[0];
      dropoff: number;
      remainingInTier: number;
      tier: number;
      pos: string;
    } | null = null;
    let maxSeverity = -1;

    for (const pos of positionsToCheck) {
      if (pos === 'QB' && rosterCounts.QB >= 1) continue;
      if (pos === 'TE' && rosterCounts.TE >= 1) continue;

      const availInPos = availablePlayers.filter(p => p.pos === pos);
      if (availInPos.length === 0) continue;

      const currentTier = availInPos[0].tier;
      const inThisTier = availInPos.filter(p => p.tier === currentTier);
      const remainingCount = inThisTier.length;

      const nextTierPlayers = availInPos.filter(p => p.tier > currentTier);
      const dropoff = nextTierPlayers.length > 0 
        ? Math.max(10, Math.round(availInPos[0].currentPts - nextTierPlayers[0].currentPts))
        : 30;

      if (remainingCount <= 3) {
        // Pick the top candidate in this tier who isn't already the VORP King
        const candidate = inThisTier.find(p => p.id !== bestVorp?.id) || availInPos[0];
        if (candidate.id === bestVorp?.id) continue;

        // Proximity Guard: In early rounds (1-4), don't trigger tier cliffs for players whose ADP
        // is far beyond the current pick (e.g. Bowers ADP 23 at Pick 1). Reaching 10+ picks in Round 1 is reckless.
        const maxReach = currentRound <= 3 ? 10 : 16;
        if (candidate.currentAdp > currentPick + maxReach) continue;

        const severity = dropoff * (4 - remainingCount) * (Math.min(pickGap, 22) / 10);
        if (severity > maxSeverity) {
          maxSeverity = severity;
          topCliffCandidate = {
            player: candidate,
            dropoff,
            remainingInTier: remainingCount,
            tier: currentTier,
            pos
          };
        }
      }
    }

    if (topCliffCandidate) {
      const { player, dropoff, remainingInTier, tier, pos } = topCliffCandidate;
      recs.push({
        type: 'scarcity',
        title: 'Tier ' + tier + ' ' + pos + ' Cliff Warning',
        badge: 'SCARCITY ALERT',
        player: player,
        rationale: 'Only ' + remainingInTier + ' ' + pos + ' remaining in Tier ' + tier + '. With ' + pickGap + ' picks before your next turn, this tier will vanish.',
        secondaryNote: '~' + dropoff + ' pt projected dropoff to Tier ' + (tier + 1) + ' | ' + player.pos_rank,
        color: 'amber'
      });
    } else {
      const maxReach = currentRound <= 3 ? 12 : 20;
      const valueSteal = [...validPool]
        .filter(p => p.id !== bestVorp?.id && p.currentAdp <= currentPick + maxReach)
        .sort((a, b) => b.adpValueDiff - a.adpValueDiff)[0];

      if (valueSteal) {
        const isTrueDiscount = valueSteal.adpValueDiff > 0;
        recs.push({
          type: 'scarcity',
          title: isTrueDiscount ? 'Draft Board Faller / Steal' : 'Top Consensus Value',
          badge: isTrueDiscount ? 'ADP DISCOUNT' : 'BEST AVAILABLE',
          player: valueSteal,
          rationale: isTrueDiscount
            ? 'Sliding past expected ADP (' + valueSteal.currentAdp + ') by +' + valueSteal.adpValueDiff + ' picks. Great value arbitrage.'
            : 'Highest ranked consensus player near current ADP (' + valueSteal.currentAdp + ').',
          secondaryNote: valueSteal.pos_rank + ' | ' + valueSteal.team + ' | Proj ' + valueSteal.currentPts + ' pts',
          color: 'amber'
        });
      }
    }

    // 3. Roster Fit / Need
    const targetWRs = rosterFormat === '3wr' ? 3 : 2;
    const needQB = rosterCounts.QB === 0 && currentRound >= 3;
    const needTE = rosterCounts.TE === 0 && currentRound >= 3;
    const needRB = rosterCounts.RB < 2;
    const needWR = rosterCounts.WR < targetWRs;

    const usedIds = new Set(recs.map(r => r.player.id));
    const needCandidates = validPool.filter(p => !usedIds.has(p.id));

    const scoredNeedCandidates = needCandidates.map(p => {
      let score = p.currentVorp;
      let reason = 'High upside roster fit';

      if (p.pos === 'WR' && needWR) {
        score += 25;
        reason = 'Fills Starting WR' + (rosterCounts.WR + 1) + ' vacancy';
      } else if (p.pos === 'RB' && needRB) {
        score += 25;
        reason = 'Fills Starting RB' + (rosterCounts.RB + 1) + ' slot';
      } else if (p.pos === 'TE' && needTE) {
        score += 20;
        reason = 'Locks in starting elite TE';
      } else if (p.pos === 'QB' && needQB) {
        score += 15;
        reason = 'Secures cornerstone QB1';
      } else if (rosterCounts.RB >= 2 && rosterCounts.WR >= targetWRs && !structuredRoster.flex) {
        score += 15;
        reason = 'Impact FLEX contributor';
      }

      const byeClashes = myRoster.filter(r => r.bye === p.bye && r.bye > 0).length;
      if (byeClashes >= 2) {
        score -= 15;
        reason += ' (Caution: ' + byeClashes + ' players on Bye ' + p.bye + ')';
      } else if (byeClashes === 0 && p.bye > 0) {
        score += 5;
        reason += ' (Clean Bye Wk ' + p.bye + ')';
      }

      return { player: p, score, reason };
    });

    scoredNeedCandidates.sort((a, b) => b.score - a.score);
    const topNeed = scoredNeedCandidates[0];

    if (topNeed) {
      recs.push({
        type: 'need',
        title: 'Roster Architecture & Fit',
        badge: 'STARTING NEED',
        player: topNeed.player,
        rationale: topNeed.reason,
        secondaryNote: topNeed.player.pos_rank + ' | ' + topNeed.player.currentPts + ' Proj Pts | Tier ' + topNeed.player.tier,
        color: 'blue'
      });
    }

    return recs;
  }, [availablePlayers, currentRound, rosterCounts, isMyTurn, nextUserPick, currentPick, picksUntilTurn, rosterFormat, structuredRoster.flex, myRoster]);

  const handleDraftForMe = (player: Player) => {
    const newRecord: PickRecord = {
      pickNo: currentPick,
      round: currentRound,
      pickInRound: pickInCurrentRound,
      teamSlot: userSlot,
      teamName: espnMyTeamName || ('Slot #' + userSlot + ' (YOU)'),
      isUser: true,
      player: player,
      timestamp: new Date().toLocaleTimeString()
    };
    setDraftHistory(prev => [...prev, newRecord]);
  };

  const handlePlayerTaken = (player: Player) => {
    const newRecord: PickRecord = {
      pickNo: currentPick,
      round: currentRound,
      pickInRound: pickInCurrentRound,
      teamSlot: currentTeamSlot,
      teamName: 'Slot #' + currentTeamSlot,
      isUser: false,
      player: player,
      timestamp: new Date().toLocaleTimeString()
    };
    setDraftHistory(prev => [...prev, newRecord]);
  };

  const handleUndo = () => {
    setDraftHistory(prev => prev.slice(0, -1));
  };

  const handleReset = () => {
    if (confirm('Reset entire draft? This will clear all picks made so far.')) {
      setDraftHistory([]);
      try {
        localStorage.removeItem('warroom_history');
      } catch (_e) {}
    }
  };

  const filteredPlayers = useMemo(() => {
    return availablePlayers.filter(p => {
      if (selectedPos !== 'ALL' && p.pos !== selectedPos) return false;
      if (selectedTier !== 'ALL' && p.tier.toString() !== selectedTier) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchTeam = p.team.toLowerCase().includes(q);
        const matchPos = p.pos.toLowerCase().includes(q);
        if (!matchName && !matchTeam && !matchPos) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'vorp') return b.currentVorp - a.currentVorp;
      if (sortBy === 'adp') return a.currentAdp - b.currentAdp;
      if (sortBy === 'pts') return b.currentPts - a.currentPts;
      return 0;
    });
  }, [availablePlayers, selectedPos, selectedTier, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/80 text-emerald-400 shadow-sm">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  DRAFTSSISTANT
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                  2026 AI ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                12-Team Snake Draft Intelligence Engine
              </p>
            </div>
          </div>

          {/* Quick Draft Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* ESPN Connect Status Button */}
            <button
              onClick={() => setEspnModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                !espnConfigured || !espnAutoSync
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  : syncState === 'healthy'
                  ? 'bg-emerald-950/40 hover:bg-emerald-900/40 border-emerald-500/40 text-emerald-300 shadow-sm'
                  : 'bg-red-950/40 hover:bg-red-900/50 border-red-500/50 text-red-300 shadow-sm'
              }`}
              title={
                !espnConfigured
                  ? 'ESPN unconfigured — click to connect'
                  : !espnAutoSync
                  ? 'Live Sync is paused (manual mode)'
                  : syncState === 'healthy'
                  ? 'Live Sync healthy'
                  : `Live Sync degraded (${espnSyncErrors} failed polls)`
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  syncState === 'healthy'
                    ? 'bg-emerald-400 animate-pulse'
                    : syncState === 'degraded' || syncState === 'lost'
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-slate-500'
                }`}
              />
              <span className={`font-bold ${syncState === 'degraded' || syncState === 'lost' ? 'text-red-400' : 'text-slate-200'}`}>
                ESPN
              </span>
              <span className="hidden sm:inline">
                {espnConfigured ? espnLeagueName.slice(0, 14) : 'Connect League'}
              </span>
            </button>

            {/* Draft Slot Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <span className="text-xs text-slate-400 font-medium">My Slot:</span>
              <select
                value={userSlot}
                onChange={e => setUserSlot(parseInt(e.target.value, 10))}
                className="bg-slate-900 text-emerald-400 font-bold text-sm px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {[...Array(numTeams)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Slot #{i + 1}
                  </option>
                ))}
              </select>
            </div>

            {/* Scoring Toggle */}
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setScoring('half')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  scoring === 'half'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                0.5 PPR
              </button>
              <button
                onClick={() => setScoring('ppr')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  scoring === 'ppr'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1.0 PPR
              </button>
              <button
                onClick={() => setScoring('std')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  scoring === 'std'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Standard
              </button>
            </div>

            {/* Roster 2WR vs 3WR */}
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setRosterFormat('2wr')}
                className={`px-2 py-1 rounded font-medium transition-all ${
                  rosterFormat === '2wr'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2 WR
              </button>
              <button
                onClick={() => setRosterFormat('3wr')}
                className={`px-2 py-1 rounded font-medium transition-all ${
                  rosterFormat === '3wr'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3 WR
              </button>
            </div>

            {/* Undo Button */}
            <button
              onClick={handleUndo}
              disabled={draftHistory.length === 0}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                draftHistory.length > 0
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Undo last pick"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Undo
            </button>

            {/* Reset Draft */}
            <button
              onClick={handleReset}
              className="text-xs px-2 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 transition-all"
              title="Reset entire draft"
            >
              Reset
            </button>
          </div>
        </div>

        {/* CLOCK & ON-DECK BANNER */}
        <div className={`px-4 py-2 border-t ${
          isMyTurn 
            ? 'bg-emerald-950/60 border-emerald-500/50 animate-pulse' 
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">ROUND:</span>
                <span className="font-bold text-slate-100">{currentRound}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400 text-xs">PICK:</span>
                <span className="font-bold text-slate-100">{pickInCurrentRound}</span>
                <span className="text-slate-400 text-xs">({currentPick} overall)</span>
              </div>

              {isMyTurn ? (
                <div className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold">
                  <Flame className="w-4 h-4 text-emerald-400" />
                  YOU ARE ON THE CLOCK!
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-xs text-slate-400">Current Turn:</span>
                  <span className="font-semibold text-cyan-400">Team {currentTeamSlot}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                    {picksUntilTurn} {picksUntilTurn === 1 ? 'pick' : 'picks'} until your turn
                  </span>
                </div>
              )}
            </div>
            {/* ESPN Sync Status Indicator */}
            {espnConfigured && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">
                  Team: <strong className="text-slate-200">{espnMyTeamName || 'My Team'}</strong>
                </span>
                <button
                  onClick={() => {
                    const nextSync = !espnAutoSync;
                    setEspnAutoSync(nextSync);
                    if (nextSync) setEspnSyncErrors(0);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded font-mono text-[11px] border transition-all ${
                    !espnAutoSync
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                      : syncState === 'healthy'
                      ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/50'
                      : 'bg-red-950/60 hover:bg-red-900/60 text-red-300 border-red-500/50'
                  }`}
                  title={
                    !espnAutoSync
                      ? 'Live Sync is paused (manual mode active). Click to resume auto-sync.'
                      : syncState === 'healthy'
                      ? 'Live Sync is healthy. Click to pause and switch to manual mode.'
                      : `Live Sync degraded (${espnSyncErrors} consecutive failed polls). Click to pause and switch to manual mode.`
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      !espnAutoSync
                        ? 'bg-slate-500'
                        : syncState === 'healthy'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-red-500 animate-pulse'
                    }`}
                  />
                  <RefreshCw className={`w-3 h-3 ${espnAutoSync && syncState === 'healthy' ? 'animate-spin' : ''}`} />
                  {espnAutoSync
                    ? syncState === 'lost'
                      ? 'Sync Lost'
                      : syncState === 'degraded'
                      ? 'Sync Failing'
                      : 'Live Sync ON'
                    : 'Live Sync Paused'}
                </button>
                {espnLastSync && (
                  <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                    Synced: {espnLastSync}
                  </span>
                )}
                {espnAutoSync && espnSyncErrors >= 2 && espnSyncErrors < 4 && (
                  <span className="text-[10px] text-red-400 font-mono flex items-center gap-1 font-semibold">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    Sync failing ({espnSyncErrors})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Persistent warning after four consecutive failures near the clock */}
          {espnConfigured && espnAutoSync && espnSyncErrors >= 4 && (
            <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-red-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-red-200 bg-red-950/70 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2 font-bold text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>ESPN sync lost — switch to manual mode</span>
              </div>
              <button
                onClick={() => setEspnAutoSync(false)}
                className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-bold text-xs transition-colors border border-red-500 shadow-sm"
              >
                Switch to Manual Mode
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Loading Banner */}
      {loading && allPlayers.length === 0 && (
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 text-xs flex items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>Loading fantasy player projections and ADP pool...</span>
        </div>
      )}

      {/* Error Alert / Retry Banner */}
      {loadError && (
        <div className="bg-red-950/80 border-b border-red-500/60 px-4 py-2 text-xs flex items-center justify-between text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={loadPlayerData}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* ESPN CONNECTION MODAL */}
      {espnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-red-500 font-extrabold text-lg">ESPN</span>
                <h3 className="font-bold text-slate-100 text-lg">
                  Fantasy League Live Sync
                </h3>
              </div>
              <button
                onClick={() => setEspnModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Connect your ESPN Fantasy League to automatically import your exact scoring rules, roster positions, detect your 7:00 PM draft slot, and auto-cross off picks in real time.
            </p>

            <form onSubmit={handleConnectEspn} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  ESPN League ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 12345678 (from ESPN URL: leagueId=...)"
                  value={inputLeagueId}
                  onChange={e => setInputLeagueId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  espn_s2 Cookie
                </label>
                <input
                  type="text"
                  required
                  placeholder="Long alphanumeric string from DevTools -> Cookies"
                  value={inputEspnS2}
                  onChange={e => setInputEspnS2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  SWID Cookie
                </label>
                <input
                  type="text"
                  required
                  placeholder="{12345678-ABCD-1234-ABCD-1234567890AB}"
                  value={inputSwid}
                  onChange={e => setInputSwid(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              {espnError && (
                <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{espnError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEspnModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={espnLoading}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {espnLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {espnLoading ? 'Connecting...' : 'Connect & Calibrate'}
                </button>
              </div>
            </form>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Cookies stay local on your machine and are only used to query your league LM API.</span>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* TOP 3 AI RECOMMENDATIONS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold tracking-tight text-slate-100">
                AI WAR ROOM TARGETS (RULE OF 3)
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              Evaluated against 12-team VORP & snake turn cliffs
            </span>
          </div>

          {/* Visible Manual Mode Explanation Banner */}
          {!isSyncHealthy && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {!espnConfigured
                    ? 'Manual Mode Active: Connect ESPN to enable live draft sync, or use manual draft controls below.'
                    : !espnAutoSync
                    ? 'Manual Mode Active: Live Sync is paused. "Draft for Me" and "Taken" buttons are unlocked for manual logging.'
                    : 'Manual Override Active: ESPN sync is degraded. Manual draft controls are unlocked so your board stays accurate.'}
                </span>
              </div>
              {espnConfigured && !espnAutoSync && (
                <button
                  onClick={() => {
                    setEspnAutoSync(true);
                    setEspnSyncErrors(0);
                  }}
                  className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline shrink-0"
                >
                  Resume Live Sync
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {recommendations.map((rec, idx) => {
              const p = rec.player;
              const isAmber = rec.color === 'amber';
              const isEmerald = rec.color === 'emerald';

              const cardBorder = isEmerald
                ? 'border-emerald-500/50 bg-emerald-950/20 hover:border-emerald-400'
                : isAmber
                ? 'border-amber-500/50 bg-amber-950/20 hover:border-amber-400'
                : 'border-blue-500/50 bg-blue-950/20 hover:border-blue-400';

              const badgeColor = isEmerald
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : isAmber
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-blue-500/20 text-blue-300 border-blue-500/40';

              return (
                <div
                  key={idx}
                  className={`relative flex flex-col justify-between rounded-xl border p-4 shadow-lg backdrop-blur-sm transition-all duration-200 ${cardBorder}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}>
                        {rec.badge}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        Option #{idx + 1}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-200 mb-1">
                      {rec.title}
                    </h3>

                    {/* Player Info */}
                    <div className="flex items-start justify-between gap-2 mt-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-base text-slate-100">
                            {p.name}
                          </span>
                          {p.injury && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-red-900/50 text-red-300 font-semibold border border-red-700/50">
                              {p.injury}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className="font-bold text-cyan-400">{p.pos}</span>
                          <span>•</span>
                          <span>{p.team}</span>
                          <span>•</span>
                          <span className="text-amber-400 font-medium">Bye Wk {p.bye}</span>
                          <span>•</span>
                          <span className="text-slate-300 font-mono">Tier {p.tier}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-black text-emerald-400 leading-none">
                          {p.currentPts}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                          Proj Pts
                        </div>
                        <div className="text-[11px] font-mono text-cyan-300 mt-1">
                          +{p.currentVorp} VORP
                        </div>
                      </div>
                    </div>

                    {/* AI Rationale */}
                    <div className="mt-3 text-xs bg-slate-950/50 p-2.5 rounded border border-slate-800/80 space-y-1">
                      <p className="text-slate-200 font-medium leading-relaxed">
                        {rec.rationale}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {rec.secondaryNote}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                    <button
                      onClick={() => handleDraftForMe(p)}
                      disabled={isSyncHealthy}
                      title={isSyncHealthy ? syncLockedTooltip : 'Draft for my team'}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                        isSyncHealthy
                          ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed shadow-none'
                          : isEmerald
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : isAmber
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${isSyncHealthy ? 'text-slate-500' : ''}`} />
                      Draft for Me
                    </button>
                    <button
                      onClick={() => handlePlayerTaken(p)}
                      disabled={isSyncHealthy}
                      title={isSyncHealthy ? syncLockedTooltip : 'Mark as drafted by someone else'}
                      className={`px-3 py-2 rounded-lg font-medium text-xs transition-colors border ${
                        isSyncHealthy
                          ? 'bg-slate-800/50 text-slate-600 border-slate-800 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                      }`}
                    >
                      Taken
                    </button>
                  </div>
                </div>
              );
            })}

            {/* 4th Column: SLOT 1.01 BATTLE CARD & BROWNS RADAR */}
            <div className="relative flex flex-col justify-between rounded-xl border border-cyan-500/40 bg-gradient-to-b from-slate-900/90 to-cyan-950/30 p-4 shadow-lg backdrop-blur-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border-cyan-500/40">
                    SLOT 1.01 STRATEGY
                  </span>
                  <span className="text-xs font-semibold text-emerald-400">
                    BROWNS RADAR
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                  <span>Turn Blueprint & Contingencies</span>
                </h3>

                {/* Turn-by-Turn Compact Timeline */}
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 text-[11px] font-mono">
                  {/* Pick 1 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick <= 1
                      ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200 shadow-sm ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#1 (1.01)</span>
                      <span className="text-[10px] text-emerald-400">👑 BELLCOW</span>
                    </div>
                    <div className="truncate text-slate-200">A: Gibbs / Bijan / Chase</div>
                  </div>

                  {/* Turn 2: 24/25 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 2 && currentPick <= 25
                      ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200 shadow-sm ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#24 / #25</span>
                      <span className="text-[10px] text-amber-300">CORE STACK</span>
                    </div>
                    <div className="truncate text-slate-200">A: Nico/London + Bowers/McBride</div>
                    <div className="text-[10px] text-slate-400 truncate">B: Nabers/Pickens + Hall/Walker</div>
                  </div>

                  {/* Turn 3: 48/49 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 26 && currentPick <= 49
                      ? 'bg-amber-950/60 border-amber-500/80 text-amber-200 shadow-sm ring-1 ring-amber-500/40'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#48 / #49</span>
                      <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">🎯 BROWNS RB + QB?</span>
                    </div>
                    <div className="truncate text-amber-200 font-bold">A: Q. Judkins + Drake Maye/Burrow (QB)</div>
                    <div className="text-[10px] text-slate-400 truncate">B: D. Montgomery/Swift + Zay Flowers/Waddle</div>
                  </div>

                  {/* Turn 4: 72/73 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 50 && currentPick <= 73
                      ? 'bg-amber-950/60 border-amber-500/80 text-amber-200 shadow-sm ring-1 ring-amber-500/40'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#72 / #73</span>
                      <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">🎯 BROWNS TE + QB?</span>
                    </div>
                    <div className="truncate text-amber-200 font-bold">A: H. Fannin Jr + Jayden Daniels/Caleb (QB)</div>
                    <div className="text-[10px] text-slate-400 truncate">B: Tucker Kraft/Pitts + Odunze/Watson (WR)</div>
                  </div>

                  {/* Turn 5: 96/97 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 74 && currentPick <= 97
                      ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200 shadow-sm ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#96 / #97</span>
                      <span className="text-[10px] text-cyan-300">WR / RB CEILING</span>
                    </div>
                    <div className="truncate text-slate-200">A: High-Upside WR/RB (Stafford/Nix if QB needed)</div>
                    <div className="text-[10px] text-slate-400 truncate">B: Parker Washington / Sutton / Handcuffs</div>
                  </div>

                  {/* Turn 6: 120/121 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 98 && currentPick <= 121
                      ? 'bg-amber-950/60 border-amber-500/80 text-amber-200 shadow-sm ring-1 ring-amber-500/40'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#120 / #121</span>
                      <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">🎯 BROWNS WR</span>
                    </div>
                    <div className="truncate text-amber-200 font-bold">A: KC Concepcion (ADP 111) + RB</div>
                    <div className="text-[10px] text-slate-400 truncate">B: Jayden Reed (+32 VORP!) / Downs</div>
                  </div>

                  {/* Turn 7: 144/145 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 122 && currentPick <= 145
                      ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200 shadow-sm ring-1 ring-emerald-500/30'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#144 / #145</span>
                      <span className="text-[10px] text-emerald-400">D/ST + KICKER</span>
                    </div>
                    <div className="truncate text-slate-200">A: Top D/ST (BAL/SF/CLE) + K (Tucker/Aubrey)</div>
                  </div>

                  {/* Turn 8: 168/169 */}
                  <div className={`p-1.5 rounded border transition-all ${
                    currentPick >= 146
                      ? 'bg-amber-950/60 border-amber-500/80 text-amber-200 shadow-sm ring-1 ring-amber-500/40'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-cyan-400">#168 / #169</span>
                      <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">🎯 SLEEPER</span>
                    </div>
                    <div className="truncate text-amber-200 font-bold">A: Denzel Boston (ADP 171) + Flier</div>
                    <div className="text-[10px] text-slate-400 truncate">B: Backup RB Handcuff / Upside WR</div>
                  </div>
                </div>
              </div>

              {/* Bottom Card Quick Tip */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-cyan-300 font-semibold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  Double-Tap Turns (22-pick gaps)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Pick #{currentPick}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* MAIN BODY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ROSTER PANEL (4 COLS) */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-slate-100 text-base">
                    MY ACTIVE ROSTER
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Total Proj: </span>
                  <span className="font-extrabold text-emerald-400 text-sm">
                    {Math.round(totalRosterPoints)} pts
                  </span>
                </div>
              </div>

              {/* Lineup Slots */}
              <div className="space-y-1.5 text-xs">
                <LineupSlot
                  slotName="QB"
                  player={structuredRoster.qb}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="RB1"
                  player={structuredRoster.rbs[0] || null}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="RB2"
                  player={structuredRoster.rbs[1] || null}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="WR1"
                  player={structuredRoster.wrs[0] || null}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="WR2"
                  player={structuredRoster.wrs[1] || null}
                  scoring={scoring}
                />
                {rosterFormat === '3wr' && (
                  <LineupSlot
                    slotName="WR3"
                    player={structuredRoster.wrs[2] || null}
                    scoring={scoring}
                  />
                )}
                <LineupSlot
                  slotName="TE"
                  player={structuredRoster.te}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="FLEX"
                  player={structuredRoster.flex}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="K"
                  player={structuredRoster.k}
                  scoring={scoring}
                />
                <LineupSlot
                  slotName="DEF"
                  player={structuredRoster.def}
                  scoring={scoring}
                />

                {/* BENCH */}
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Bench ({structuredRoster.bench.length}/6)
                  </span>
                  <div className="mt-1 space-y-1">
                    {structuredRoster.bench.map((bp, i) => (
                      <LineupSlot
                        key={`${bp.id}-${i}`}
                        slotName={`BN${i + 1}`}
                        player={bp}
                        scoring={scoring}
                      />
                    ))}
                    {structuredRoster.bench.length === 0 && (
                      <div className="text-[11px] text-slate-500 italic py-1">
                        Bench empty
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bye Week Distribution */}
              <div className="mt-4 pt-3 border-t border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Bye Week Distribution
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(byeConflicts).map(([week, plist]) => {
                    const count = plist.length;
                    const isHigh = count >= 3;
                    return (
                      <span
                        key={week}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                          isHigh
                            ? 'bg-amber-950/60 text-amber-300 border-amber-600/50 font-bold'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                        title={plist.map(p => `${p.name} (${p.pos})`).join(', ')}
                      >
                        Wk {week}: {count}
                      </span>
                    );
                  })}
                  {Object.keys(byeConflicts).length === 0 && (
                    <span className="text-[11px] text-slate-500 italic">
                      No drafted players yet
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Picks Log */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm max-h-64 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Recent Picks Log
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  {draftHistory.length} total
                </span>
              </div>
              <div className="overflow-y-auto space-y-1 pr-1 flex-1 text-xs">
                {draftHistory.slice().reverse().map((rec, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-2 py-1 rounded border ${
                      rec.isUser
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500">
                        #{rec.pickNo}
                      </span>
                      <span className="font-semibold text-slate-200">
                        {rec.player.name}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400">
                        {rec.player.pos}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                      {rec.isUser ? 'YOU' : (rec.teamName || ('Slot #' + rec.teamSlot))}
                    </span>
                  </div>
                ))}
                {draftHistory.length === 0 && (
                  <div className="text-xs text-slate-500 italic py-4 text-center">
                    No picks made yet. Draft recommendations or board below!
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* DRAFT BOARD (8 COLS) */}
          <section className="lg:col-span-8 space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm">
              {/* Board Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search player, team, or position..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="vorp">Highest VORP</option>
                    <option value="adp">Consensus ADP</option>
                    <option value="pts">Projected Points</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Tier:</span>
                  <select
                    value={selectedTier}
                    onChange={e => setSelectedTier(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">All Tiers</option>
                    <option value="1">Tier 1</option>
                    <option value="2">Tier 2</option>
                    <option value="3">Tier 3</option>
                    <option value="4">Tier 4</option>
                    <option value="5">Tier 5</option>
                  </select>
                </div>
              </div>

              {/* Pos Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 mb-4 border-b border-slate-800 pb-3">
                {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(pos => (
                  <button
                    key={pos}
                    onClick={() => setSelectedPos(pos)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      selectedPos === pos
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {!isSyncHealthy ? (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                      Manual Controls Active
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Live Sync Active (Locked)
                    </span>
                  )}
                  <div className="text-xs text-slate-400">
                    {filteredPlayers.length} available
                  </div>
                </div>
              </div>

              {/* Player Board Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-semibold uppercase">
                      <th className="py-2 px-2">Player</th>
                      <th className="py-2 px-2">Pos / Rank</th>
                      <th className="py-2 px-2">Tier</th>
                      <th className="py-2 px-2">ADP</th>
                      <th className="py-2 px-2">Value</th>
                      <th className="py-2 px-2">Proj Pts</th>
                      <th className="py-2 px-2">VORP</th>
                      <th className="py-2 px-2">Bye</th>
                      <th className="py-2 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPlayers.slice(0, 60).map((player) => {
                      const adpDiff = player.adpValueDiff;
                      const hasValue = adpDiff > 2;

                      return (
                        <tr
                          key={player.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-100 group-hover:text-cyan-300">
                                {player.name}
                              </span>
                              {player.injury && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-red-950 text-red-400 font-bold border border-red-800">
                                  {player.injury}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {player.team}
                            </span>
                          </td>

                          <td className="py-2 px-2">
                            <span className="font-bold text-cyan-400 font-mono">
                              {player.pos_rank}
                            </span>
                          </td>

                          <td className="py-2 px-2">
                            <span className={`px-1.5 py-0.5 rounded font-bold font-mono text-[10px] ${
                              player.tier === 1
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : player.tier === 2
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : player.tier === 3
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              T{player.tier}
                            </span>
                          </td>

                          <td className="py-2 px-2 font-mono text-slate-300">
                            {player.currentAdp}
                          </td>

                          <td className="py-2 px-2 font-mono">
                            {hasValue ? (
                              <span className="text-emerald-400 font-semibold">
                                +{adpDiff}
                              </span>
                            ) : adpDiff < -3 ? (
                              <span className="text-slate-500">
                                {adpDiff}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {adpDiff}
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-2 font-bold font-mono text-slate-200">
                            {player.currentPts}
                          </td>

                          <td className="py-2 px-2 font-bold font-mono text-emerald-400">
                            +{player.currentVorp}
                          </td>

                          <td className="py-2 px-2 text-slate-400 font-mono">
                            {player.bye > 0 ? player.bye : '-'}
                          </td>

                          <td className="py-2 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleDraftForMe(player)}
                                disabled={isSyncHealthy}
                                title={isSyncHealthy ? syncLockedTooltip : 'Draft for my team'}
                                className={`px-2.5 py-1 rounded font-bold text-[11px] transition-colors shadow-sm ${
                                  isSyncHealthy
                                    ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed shadow-none'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                }`}
                              >
                                Draft
                              </button>
                              <button
                                onClick={() => handlePlayerTaken(player)}
                                disabled={isSyncHealthy}
                                title={isSyncHealthy ? syncLockedTooltip : 'Mark drafted by opponent'}
                                className={`px-2 py-1 rounded text-[11px] transition-colors border ${
                                  isSyncHealthy
                                    ? 'bg-slate-800/50 text-slate-600 border-slate-800 cursor-not-allowed'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700'
                                }`}
                              >
                                Taken
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function LineupSlot({
  slotName,
  player,
  scoring
}: {
  slotName: string;
  player: Player | null;
  scoring: ScoringMode;
}) {
  const pts = player
    ? scoring === 'ppr'
      ? player.pts_ppr
      : scoring === 'std'
      ? player.pts_std
      : player.pts_half
    : 0;

  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-slate-950/60 border border-slate-800/80">
      <div className="flex items-center gap-2">
        <span className="w-8 font-bold font-mono text-slate-400 text-[10px]">
          {slotName}
        </span>
        {player ? (
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-200 text-xs">
              {player.name}
            </span>
            <span className="text-[10px] text-slate-400">
              {player.team}
            </span>
            <span className="text-[10px] text-amber-400 font-medium">
              (Bye {player.bye})
            </span>
          </div>
        ) : (
          <span className="text-slate-600 italic text-[11px]">
            Empty slot
          </span>
        )}
      </div>

      {player && (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-emerald-400 text-xs">
            {pts}
          </span>
        </div>
      )}
    </div>
  );
}
