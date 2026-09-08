'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
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
  Link2,
  X,
  Check,
  Radio,
  Settings,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface Player {
  id: string;
  espn_id?: string;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
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

  // Draft active state
  const [draftHistory, setDraftHistory] = useState<PickRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPos, setSelectedPos] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'vorp' | 'adp' | 'pts'>('vorp');

  // Load initial player data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/draft');
        const data = await res.json();
        if (data.success) {
          setAllPlayers(data.players || []);
        }
      } catch (err) {
        console.error('Failed to load fantasy dataset:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Check saved ESPN configuration on load
  useEffect(() => {
    async function checkEspn() {
      try {
        const res = await fetch('/api/espn');
        const data = await res.json();
        if (data.configured && data.success) {
          setEspnConfigured(true);
          setEspnLeagueName(data.leagueName || 'ESPN League');
          if (data.myTeam) setEspnMyTeamName(data.myTeam.name);
          if (data.myDraftSlot) {
            setUserSlot(data.myDraftSlot);
            try { localStorage.setItem('warroom_slot', data.myDraftSlot.toString()); } catch (e) {}
          }
          if (data.scoring?.detectedScoring) {
            setScoring(data.scoring.detectedScoring);
            try { localStorage.setItem('warroom_scoring', data.scoring.detectedScoring); } catch (e) {}
          }
          if (data.rosterConfig?.wr >= 3) {
            setRosterFormat('3wr');
            try { localStorage.setItem('warroom_format', '3wr'); } catch (e) {}
          } else {
            setRosterFormat('2wr');
            try { localStorage.setItem('warroom_format', '2wr'); } catch (e) {}
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
        if (Array.isArray(parsed)) setDraftHistory(parsed);
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
    } catch (e) {}
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
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data.success && data.draft?.picks) {
          setEspnLastSync(new Date().toLocaleTimeString());
          const espnPicks = data.draft.picks;

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

            if (matchedPlayer) {
              newHistory.push({
                pickNo: ep.overallPick,
                round: ep.round,
                pickInRound: ep.roundPick,
                teamSlot: ep.teamId,
                isUser: ep.isUser,
                player: matchedPlayer,
                timestamp: new Date().toLocaleTimeString()
              });
            }
          });

          if (newHistory.length > 0 && newHistory.length !== draftHistory.length) {
            setDraftHistory(newHistory);
          }
        }
      } catch (err) {
        console.warn('ESPN polling error:', err);
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
      } catch (e) {}
    }
  }, [isMyTurn]);

  // Roster counts
  const rosterCounts = useMemo(() => {
    const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
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
        const severity = dropoff * (4 - remainingCount) * (Math.min(pickGap, 22) / 10);
        if (severity > maxSeverity && availInPos[0].id !== bestVorp?.id) {
          maxSeverity = severity;
          topCliffCandidate = {
            player: availInPos[0],
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
      const valueSteal = [...validPool]
        .filter(p => p.id !== bestVorp?.id)
        .sort((a, b) => b.adpValueDiff - a.adpValueDiff)[0];

      if (valueSteal) {
        recs.push({
          type: 'scarcity',
          title: 'Draft Board Faller / Steal',
          badge: 'ADP DISCOUNT',
          player: valueSteal,
          rationale: 'Sliding past expected ADP (' + valueSteal.currentAdp + ') by +' + valueSteal.adpValueDiff + ' picks. Great value arbitrage.',
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
      } catch (e) {}
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
                espnConfigured
                  ? 'bg-red-950/40 border-red-500/50 text-red-300 hover:bg-red-900/50 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${espnConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="font-bold text-red-400">ESPN</span>
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
                {[...Array(12)].map((_, i) => (
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
                  onClick={() => setEspnAutoSync(!espnAutoSync)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded font-mono text-[11px] border transition-all ${
                    espnAutoSync
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${espnAutoSync ? 'animate-spin' : ''}`} />
                  {espnAutoSync ? 'Live Sync ON' : 'Live Sync Paused'}
                </button>
                {espnLastSync && (
                  <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                    Synced: {espnLastSync}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 text-white transition-all shadow-md ${
                        isEmerald
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : isAmber
                          ? 'bg-amber-600 hover:bg-amber-500'
                          : 'bg-blue-600 hover:bg-blue-500'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Draft for Me
                    </button>
                    <button
                      onClick={() => handlePlayerTaken(p)}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs transition-colors border border-slate-700"
                      title="Mark as drafted by someone else"
                    >
                      Taken
                    </button>
                  </div>
                </div>
              );
            })}
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
                        key={bp.id}
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
                    <span className="text-[10px] text-slate-400">
                      {rec.isUser ? 'YOU' : `Team ${rec.teamSlot}`}
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
                <div className="ml-auto text-xs text-slate-400">
                  {filteredPlayers.length} available
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
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors shadow-sm"
                                title="Draft for my team"
                              >
                                Draft
                              </button>
                              <button
                                onClick={() => handlePlayerTaken(player)}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[11px] transition-colors border border-slate-700"
                                title="Mark drafted by opponent"
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
