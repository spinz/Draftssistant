#!/usr/bin/env python3
"""
Historical ESPN Draft Analysis & Scouting Report Generator
------------------------------------------------------------
Analyzes prior seasons (up to 10 years, 2015-2025) for all active 2026 managers.
Conservative matching: Matches managers strictly by ESPN Owner SWID.
Ownership changes / unmapped teams are marked as 'Unknown' / excluded from manager profiles.
Weights recent 3 seasons (2023-2025) more heavily than older seasons.
Outputs:
  - reports/historical_draft_analysis.json
  - reports/historical_draft_scouting_report.md
"""

import os
import sys
import json
import urllib.request
import statistics
from collections import defaultdict, Counter
from typing import Dict, List, Any, Optional

# Constants
NFL_TEAMS = {
    1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
    9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
    17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
    25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
}

POS_NAMES = {
    1: 'QB',
    2: 'RB',
    3: 'WR',
    4: 'TE',
    5: 'K',
    16: 'DEF'
}

def resolve_config_path() -> str:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, '..', 'src', 'data', 'espn_config.json'),
        os.path.join(script_dir, '..', 'espn_config.json'),
        '/home/robbie/nova-dashboard/src/data/espn_config.json'
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    raise FileNotFoundError("Could not locate espn_config.json with credentials.")

def make_espn_request(url: str, espn_s2: str, swid: str, x_filter: Optional[dict] = None) -> Any:
    headers = {
        'Cookie': f'espn_s2={espn_s2}; SWID={swid};',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/json'
    }
    if x_filter:
        headers['x-fantasy-filter'] = json.dumps(x_filter)

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))

def weighted_mean(values: List[float], weights: List[float]) -> float:
    if not values:
        return 0.0
    total_weight = sum(weights)
    if total_weight == 0:
        return float(statistics.mean(values))
    return sum(v * w for v, w in zip(values, weights)) / total_weight

def main():
    print("==================================================================")
    print("ESPN Historical League Draft Scouting Engine (2015-2025)")
    print("==================================================================")

    config_path = resolve_config_path()
    with open(config_path, 'r', encoding='utf-8') as f:
        cfg = json.load(f)

    league_id = str(cfg['leagueId']).strip()
    espn_s2 = cfg['espn_s2'].strip()
    swid = cfg['swid'].strip()

    print(f"Loaded credentials for League ID: {league_id}")

    # 1. Fetch current 2026 League State & Managers
    print("\n[1/4] Fetching 2026 League Members and Teams...")
    url_2026 = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/{league_id}?view=mTeam&view=mSettings"
    raw_2026 = make_espn_request(url_2026, espn_s2, swid)

    members_2026 = {}
    for m in raw_2026.get('members', []):
        m_id = m['id'].strip().upper()
        name = f"{m.get('firstName', '')} {m.get('lastName', '')}".strip() or m.get('displayName', 'Unknown')
        members_2026[m_id] = name

    # Map current managers
    current_managers = {}
    for t in raw_2026.get('teams', []):
        t_owners = [o.strip().upper() for o in (t.get('owners') or [t.get('primaryOwner')]) if o]
        names = list(dict.fromkeys([members_2026.get(o, o) for o in t_owners]))
        primary_swid = t_owners[0] if t_owners else f"TEAM_{t['id']}"
        manager_display = ' / '.join(names) or t.get('name', f"Team {t['id']}")
        
        current_managers[primary_swid] = {
            'manager_id': primary_swid,
            'manager_name': manager_display,
            'current_team_name': t.get('name', f"Team {t['id']}"),
            'current_team_id': t['id'],
            'owner_swids': set(t_owners),
            'drafts': []
        }

    print(f"✓ Identified {len(current_managers)} active 2026 managers.")
    for mgr in current_managers.values():
        print(f"  - Team {mgr['current_team_id']:2d}: {mgr['manager_name']:<25} ({mgr['current_team_name']})")

    # 2. Fetch Historical Seasons (2015-2025)
    print("\n[2/4] Querying available draft logs across prior 10 seasons (2015–2025)...")
    historical_seasons = {}
    
    # Filter for player info
    player_filter = {
        'players': {
            'limit': 2000,
            'sortDraftRanks': {'sortPriority': 100, 'sortAsc': True, 'value': 'STANDARD'}
        }
    }

    for season in range(2015, 2026):
        sys.stdout.write(f"  Fetching Season {season}... ")
        sys.stdout.flush()

        # Try direct endpoint first, then leagueHistory
        url_draft = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league_id}?view=mDraftDetail&view=mTeam"
        url_kona = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league_id}?view=kona_player_info"
        
        d_raw = None
        k_raw = None
        try:
            d_raw = make_espn_request(url_draft, espn_s2, swid)
            k_raw = make_espn_request(url_kona, espn_s2, swid, x_filter=player_filter)
        except Exception:
            # Fallback to leagueHistory endpoint
            url_draft_hist = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{league_id}?seasonId={season}&view=mDraftDetail&view=mTeam"
            url_kona_hist = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{league_id}?seasonId={season}&view=kona_player_info"
            try:
                d_raw = make_espn_request(url_draft_hist, espn_s2, swid)
                k_raw = make_espn_request(url_kona_hist, espn_s2, swid, x_filter=player_filter)
            except Exception as e:
                print(f"Unavailable ({e})")
                continue

        d_item = d_raw[0] if isinstance(d_raw, list) else d_raw
        k_item = k_raw[0] if isinstance(k_raw, list) else k_raw

        draft_detail = d_item.get('draftDetail', {})
        raw_picks = draft_detail.get('picks', [])
        real_picks = [p for p in raw_picks if p.get('playerId') is not None and p.get('playerId') != -1]

        if not draft_detail.get('drafted', False) or len(real_picks) == 0:
            print(f"Unusable / No Draft Recorded ({len(real_picks)} picks)")
            continue

        # Build player lookup
        player_dict = {}
        for p_entry in k_item.get('players', []):
            pl = p_entry.get('player', {})
            player_dict[pl.get('id')] = pl

        # Build team owners lookup for this season
        season_teams = {}
        for tm in d_item.get('teams', []):
            t_id = tm['id']
            owners = [o.strip().upper() for o in (tm.get('owners') or [tm.get('primaryOwner')]) if o]
            season_teams[t_id] = {
                'team_id': t_id,
                'team_name': tm.get('name', f"Team {t_id}"),
                'owners': set(owners)
            }

        historical_seasons[season] = {
            'season': season,
            'picks': real_picks,
            'players': player_dict,
            'teams': season_teams,
            'total_picks': len(real_picks)
        }
        print(f"USABLE ({len(real_picks)} picks, {len(season_teams)} teams)")

    print(f"\n✓ Successfully loaded {len(historical_seasons)} usable historical drafts.")

    # 3. Analyze Drafts & Match to Current Managers
    print("\n[3/4] Parsing manager picks, runs, and tendencies...")

    for season, s_data in sorted(historical_seasons.items()):
        real_picks = s_data['picks']
        player_dict = s_data['players']
        season_teams = s_data['teams']
        total_picks = len(real_picks)

        # Map each pick to manager and parse attributes
        processed_picks = []
        for p in real_picks:
            pid = p.get('playerId')
            tid = p.get('teamId')
            overall_pick = p.get('overallPickNumber')
            round_no = p.get('roundId')
            round_pick = p.get('roundPickNumber')

            # Identify team and owner
            tm = season_teams.get(tid, {})
            tm_owners = tm.get('owners', set())

            matched_manager_key = None
            for m_key, m_info in current_managers.items():
                if tm_owners.intersection(m_info['owner_swids']):
                    matched_manager_key = m_key
                    break

            # Resolve player metadata
            pl = player_dict.get(pid, {})
            p_name = pl.get('fullName') or pl.get('name')
            pos_id = pl.get('defaultPositionId')
            pos_str = POS_NAMES.get(pos_id, 'FLEX')
            pro_team_id = pl.get('proTeamId')
            pro_team = NFL_TEAMS.get(pro_team_id, 'FA')
            adp = pl.get('ownership', {}).get('averageDraftPosition', 0.0)

            # Check D/ST negative ID format
            if pid is not None and pid < 0:
                pos_str = 'DEF'
                dst_offset = abs(pid) - 16000
                if dst_offset in NFL_TEAMS:
                    pro_team = NFL_TEAMS[dst_offset]
                    p_name = f"{pro_team} D/ST"

            processed_picks.append({
                'overall_pick': overall_pick,
                'round': round_no,
                'round_pick': round_pick,
                'team_id': tid,
                'manager_key': matched_manager_key,
                'player_id': pid,
                'player_name': p_name or f"Player #{pid}",
                'position': pos_str,
                'pro_team': pro_team,
                'adp': adp if adp and adp > 0 else None
            })

        # Detect Position Runs in this draft
        # Definition: 3 or more of same position (QB, RB, WR, TE) within 5 consecutive picks
        runs_initiated_by = defaultdict(lambda: Counter())
        runs_joined_by = defaultdict(lambda: Counter())

        for idx, pick in enumerate(processed_picks):
            pos = pick['position']
            if pos not in ('QB', 'TE', 'RB', 'WR'):
                continue
            
            # Look ahead up to 5 picks
            window = processed_picks[idx: min(len(processed_picks), idx + 5)]
            same_pos_in_window = [wp for wp in window if wp['position'] == pos]

            # Check if this started a run
            prev_window = processed_picks[max(0, idx - 3): idx]
            same_pos_prev = [wp for wp in prev_window if wp['position'] == pos]

            if len(same_pos_in_window) >= 3 and len(same_pos_prev) == 0:
                # idx initiated this run
                m_key = pick['manager_key']
                if m_key:
                    runs_initiated_by[m_key][pos] += 1
                # Subsequent picks in this window joined the run
                for joined_pick in same_pos_in_window[1:]:
                    jm_key = joined_pick['manager_key']
                    if jm_key and jm_key != m_key:
                        runs_joined_by[jm_key][pos] += 1

        # Group picks by manager for this season
        by_mgr = defaultdict(list)
        for pick in processed_picks:
            if pick['manager_key']:
                by_mgr[pick['manager_key']].append(pick)

        # Store draft summary per manager
        for m_key, mgr_picks in by_mgr.items():
            mgr_picks.sort(key=lambda x: x['overall_pick'])
            
            # Position first picks
            first_picks = {}
            for target_pos in ('QB', 'RB', 'WR', 'TE', 'K', 'DEF'):
                first_p = next((p for p in mgr_picks if p['position'] == target_pos), None)
                if first_p:
                    first_picks[target_pos] = {
                        'round': first_p['round'],
                        'overall_pick': first_p['overall_pick'],
                        'player_name': first_p['player_name']
                    }

            # Rounds 1-6 counts
            r1_6_picks = [p for p in mgr_picks if p['round'] <= 6]
            rb_r1_6 = sum(1 for p in r1_6_picks if p['position'] == 'RB')
            wr_r1_6 = sum(1 for p in r1_6_picks if p['position'] == 'WR')
            qb_r1_6 = sum(1 for p in r1_6_picks if p['position'] == 'QB')
            te_r1_6 = sum(1 for p in r1_6_picks if p['position'] == 'TE')

            first_round_pick = next((p for p in mgr_picks if p['round'] == 1), None)
            first_round_pos = first_round_pick['position'] if first_round_pick else None

            # ADP reaches (positive = reached earlier than ADP, negative = fell past ADP)
            adp_diffs = [p['adp'] - p['overall_pick'] for p in mgr_picks if p['adp'] is not None]
            adp_diffs_r1_6 = [p['adp'] - p['overall_pick'] for p in r1_6_picks if p['adp'] is not None]

            # Teams drafted
            pro_teams_drafted = [p['pro_team'] for p in mgr_picks if p['pro_team'] not in ('FA', 'DEF')]
            players_drafted = [p['player_name'] for p in mgr_picks]

            current_managers[m_key]['drafts'].append({
                'season': season,
                'total_picks': len(mgr_picks),
                'first_picks': first_picks,
                'rb_r1_6': rb_r1_6,
                'wr_r1_6': wr_r1_6,
                'qb_r1_6': qb_r1_6,
                'te_r1_6': te_r1_6,
                'first_round_pos': first_round_pos,
                'avg_adp_diff': statistics.mean(adp_diffs) if adp_diffs else None,
                'avg_adp_diff_r1_6': statistics.mean(adp_diffs_r1_6) if adp_diffs_r1_6 else None,
                'runs_started': dict(runs_initiated_by[m_key]),
                'runs_joined': dict(runs_joined_by[m_key]),
                'pro_teams': pro_teams_drafted,
                'players': players_drafted
            })

    # 4. Generate Comprehensive Profiles per Manager
    print("\n[4/4] Synthesizing executive profiles & weighting metrics...")

    profiles = []

    for m_key, mgr in current_managers.items():
        drafts = sorted(mgr['drafts'], key=lambda x: x['season'])
        num_drafts = len(drafts)

        # Confidence rating
        if num_drafts >= 7:
            confidence = "High"
        elif num_drafts >= 4:
            confidence = "Moderate-High"
        elif num_drafts >= 2:
            confidence = "Moderate"
        elif num_drafts == 1:
            confidence = "Low"
        else:
            confidence = "Insufficient Evidence"

        # Weights: recent 3 seasons (2023, 2024, 2025) weighted 2.5x, others 1.0x
        weights = [2.5 if d['season'] >= 2023 else 1.0 for d in drafts]

        # First positional picks statistics
        pos_stats = {}
        for pos in ('QB', 'RB', 'WR', 'TE', 'K', 'DEF'):
            rounds = [d['first_picks'][pos]['round'] for d in drafts if pos in d['first_picks']]
            picks = [d['first_picks'][pos]['overall_pick'] for d in drafts if pos in d['first_picks']]
            pos_weights = [w for d, w in zip(drafts, weights) if pos in d['first_picks']]

            if rounds:
                pos_stats[pos] = {
                    'count': len(rounds),
                    'total_drafts': num_drafts,
                    'avg_round': round(statistics.mean(rounds), 2),
                    'median_round': round(statistics.median(rounds), 1),
                    'weighted_avg_round': round(weighted_mean(rounds, pos_weights), 2),
                    'avg_pick': round(statistics.mean(picks), 1),
                    'median_pick': round(statistics.median(picks), 1),
                    'weighted_avg_pick': round(weighted_mean(picks, pos_weights), 1),
                    'earliest_round': min(rounds),
                    'latest_round': max(rounds)
                }
            else:
                pos_stats[pos] = {
                    'count': 0,
                    'total_drafts': num_drafts,
                    'avg_round': None,
                    'median_round': None,
                    'weighted_avg_round': None,
                    'avg_pick': None,
                    'median_pick': None,
                    'weighted_avg_pick': None,
                    'earliest_round': None,
                    'latest_round': None
                }

        # Early positional selections counts
        early_qb_count = sum(1 for d in drafts if 'QB' in d['first_picks'] and d['first_picks']['QB']['round'] <= 4)
        early_te_count = sum(1 for d in drafts if 'TE' in d['first_picks'] and d['first_picks']['TE']['round'] <= 4)
        early_k_count = sum(1 for d in drafts if 'K' in d['first_picks'] and d['first_picks']['K']['round'] < 12)
        early_dst_count = sum(1 for d in drafts if 'DEF' in d['first_picks'] and d['first_picks']['DEF']['round'] < 12)

        early_tendencies = {
            'early_qb': {
                'count': early_qb_count,
                'total': num_drafts,
                'pct': round((early_qb_count / num_drafts * 100), 1) if num_drafts > 0 else 0.0
            },
            'early_te': {
                'count': early_te_count,
                'total': num_drafts,
                'pct': round((early_te_count / num_drafts * 100), 1) if num_drafts > 0 else 0.0
            },
            'early_k': {
                'count': early_k_count,
                'total': num_drafts,
                'pct': round((early_k_count / num_drafts * 100), 1) if num_drafts > 0 else 0.0
            },
            'early_dst': {
                'count': early_dst_count,
                'total': num_drafts,
                'pct': round((early_dst_count / num_drafts * 100), 1) if num_drafts > 0 else 0.0
            }
        }

        # Rounds 1-6 RB vs WR construction
        rbs_r1_6 = [d['rb_r1_6'] for d in drafts]
        wrs_r1_6 = [d['wr_r1_6'] for d in drafts]

        rb_r1_6_avg = round(statistics.mean(rbs_r1_6), 2) if rbs_r1_6 else 0.0
        wr_r1_6_avg = round(statistics.mean(wrs_r1_6), 2) if wrs_r1_6 else 0.0
        rb_r1_6_weighted = round(weighted_mean(rbs_r1_6, weights), 2) if rbs_r1_6 else 0.0
        wr_r1_6_weighted = round(weighted_mean(wrs_r1_6, weights), 2) if wrs_r1_6 else 0.0

        r1_pos_counts = Counter(d['first_round_pos'] for d in drafts if d['first_round_pos'])
        r1_rb_count = r1_pos_counts.get('RB', 0)
        r1_wr_count = r1_pos_counts.get('WR', 0)
        r1_te_count = r1_pos_counts.get('TE', 0)
        r1_qb_count = r1_pos_counts.get('QB', 0)

        # ADP reach/discount
        adp_diffs_all = [d['avg_adp_diff'] for d in drafts if d['avg_adp_diff'] is not None]
        adp_diffs_r1_6 = [d['avg_adp_diff_r1_6'] for d in drafts if d['avg_adp_diff_r1_6'] is not None]
        avg_reach_all = round(statistics.mean(adp_diffs_all), 2) if adp_diffs_all else 0.0
        avg_reach_r1_6 = round(statistics.mean(adp_diffs_r1_6), 2) if adp_diffs_r1_6 else 0.0

        # Runs started and joined
        total_runs_started = Counter()
        total_runs_joined = Counter()
        for d in drafts:
            for p, c in d['runs_started'].items():
                total_runs_started[p] += c
            for p, c in d['runs_joined'].items():
                total_runs_joined[p] += c

        # Team Affinity
        all_pro_teams = []
        for d in drafts:
            all_pro_teams.extend(d['pro_teams'])
        team_counts = Counter(all_pro_teams)
        total_team_picks = len(all_pro_teams)
        
        unusual_team_affinities = []
        for team, cnt in team_counts.most_common(3):
            pct = (cnt / total_team_picks * 100) if total_team_picks > 0 else 0
            # Strong affinity: >= 12% of all picks or >= 2 players per draft in 2+ drafts
            drafts_with_2plus = sum(1 for d in drafts if d['pro_teams'].count(team) >= 2)
            if (pct >= 11.5 and cnt >= 4) or drafts_with_2plus >= 2:
                unusual_team_affinities.append({
                    'team': team,
                    'picks': cnt,
                    'pct': round(pct, 1),
                    'drafts_with_multiples': drafts_with_2plus
                })

        # Player Loyalty (same player drafted in multiple years)
        player_seasons = defaultdict(list)
        for d in drafts:
            for pl in set(d['players']):
                player_seasons[pl].append(d['season'])
        
        loyal_players = []
        for pl, seasons in player_seasons.items():
            if len(seasons) >= 3 or (len(seasons) >= 2 and num_drafts <= 4):
                loyal_players.append({
                    'player': pl,
                    'times_drafted': len(seasons),
                    'seasons': sorted(seasons)
                })
        loyal_players.sort(key=lambda x: (-x['times_drafted'], x['player']))

        # Determine Draft Persona Label
        # Strict rule: never make strong claims with fewer than 2 comparable drafts
        if num_drafts < 2:
            draft_label = "insufficient evidence"
            persona_rationale = f"Only {num_drafts} historical draft recorded under this owner ID."
        else:
            qb_avg_round = pos_stats['QB']['weighted_avg_round'] or 15.0
            te_avg_round = pos_stats['TE']['weighted_avg_round'] or 15.0
            rb_avg_round = pos_stats['RB']['weighted_avg_round'] or 1.0

            if early_tendencies['early_qb']['pct'] >= 50.0 or qb_avg_round <= 3.5:
                draft_label = "early-QB"
                persona_rationale = f"Drafted QB in R1-4 in {early_qb_count}/{num_drafts} drafts ({early_tendencies['early_qb']['pct']}%), weighted avg pick Rd {qb_avg_round}."
            elif early_tendencies['early_te']['pct'] >= 50.0 or te_avg_round <= 4.0:
                draft_label = "early-TE"
                persona_rationale = f"Prioritizes elite TE early ({early_te_count}/{num_drafts} drafts in R1-4, avg Rd {te_avg_round})."
            elif rb_r1_6_weighted >= 3.4 and (pos_stats['RB']['weighted_avg_round'] or 99) <= 1.5:
                draft_label = "RB-heavy"
                persona_rationale = f"Heavy early backfield investor (weighted avg {rb_r1_6_weighted} RBs in first 6 rounds, R1 RB in {r1_rb_count}/{num_drafts} drafts)."
            elif wr_r1_6_weighted >= 3.6 or (r1_wr_count / num_drafts >= 0.60):
                draft_label = "WR-heavy"
                persona_rationale = f"Heavy wideout loadout (weighted avg {wr_r1_6_weighted} WRs in first 6 rounds, opened WR in {r1_wr_count}/{num_drafts} drafts)."
            elif rb_avg_round >= 3.0 or (rb_r1_6_weighted <= 1.7):
                draft_label = "zero-RB-ish"
                persona_rationale = f"Delays RB anchor (weighted avg 1st RB Rd {rb_avg_round}, only {rb_r1_6_weighted} RBs in first 6 rounds)."
            elif qb_avg_round >= 9.0 and early_qb_count == 0:
                draft_label = "late-QB"
                persona_rationale = f"Consistently punts QB to double-digit rounds (weighted avg Rd {qb_avg_round}, 0/{num_drafts} early QBs)."
            else:
                draft_label = "balanced-value"
                persona_rationale = f"Adaptable value drafter ({rb_r1_6_avg} RBs / {wr_r1_6_avg} WRs in R1-6, QB avg Rd {qb_avg_round})."

        profile = {
            'manager_name': mgr['manager_name'],
            'current_team_name': mgr['current_team_name'],
            'current_team_id': mgr['current_team_id'],
            'owner_swids': list(mgr['owner_swids']),
            'usable_drafts': num_drafts,
            'seasons_drafted': [d['season'] for d in drafts],
            'confidence': confidence,
            'draft_label': draft_label,
            'persona_rationale': persona_rationale,
            'first_pick_stats': pos_stats,
            'early_tendencies': early_tendencies,
            'r1_6_construction': {
                'rb_avg': rb_r1_6_avg,
                'rb_weighted_avg': rb_r1_6_weighted,
                'wr_avg': wr_r1_6_avg,
                'wr_weighted_avg': wr_r1_6_weighted,
                'first_round_openers': {
                    'RB': f"{r1_rb_count}/{num_drafts} ({round(r1_rb_count/num_drafts*100, 1) if num_drafts else 0}%)",
                    'WR': f"{r1_wr_count}/{num_drafts} ({round(r1_wr_count/num_drafts*100, 1) if num_drafts else 0}%)",
                    'TE': f"{r1_te_count}/{num_drafts} ({round(r1_te_count/num_drafts*100, 1) if num_drafts else 0}%)",
                    'QB': f"{r1_qb_count}/{num_drafts} ({round(r1_qb_count/num_drafts*100, 1) if num_drafts else 0}%)"
                }
            },
            'adp_profile': {
                'avg_reach_all_picks': avg_reach_all,
                'avg_reach_r1_6': avg_reach_r1_6,
                'interpretation': "Aggressive Reach" if avg_reach_all >= 3.0 else ("Value Bargain Hunter" if avg_reach_all <= -3.0 else "ADP Neutral")
            },
            'position_runs': {
                'runs_started': dict(total_runs_started),
                'runs_joined': dict(total_runs_joined)
            },
            'unusual_team_affinities': unusual_team_affinities,
            'loyal_players': loyal_players
        }
        profiles.append(profile)

    # Sort profiles by current team ID / slot
    profiles.sort(key=lambda x: x['current_team_id'])

    # 5. Output JSON File
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'reports')
    os.makedirs(output_dir, exist_ok=True)
    json_path = os.path.join(output_dir, 'historical_draft_analysis.json')

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({
            'generated_at': '2026-09-08',
            'league_id': league_id,
            'seasons_analyzed': sorted(list(historical_seasons.keys())),
            'total_seasons': len(historical_seasons),
            'managers': profiles
        }, f, indent=2)

    print(f"\n✓ Saved structured JSON analysis to: {os.path.abspath(json_path)}")

    # 6. Output Markdown Report
    md_path = os.path.join(output_dir, 'historical_draft_scouting_report.md')
    generate_markdown_report(md_path, profiles, historical_seasons, league_id)
    print(f"✓ Saved readable Markdown scouting report to: {os.path.abspath(md_path)}")

    print("\n==================================================================")
    print("SCOUTING REPORT GENERATION COMPLETED SUCCESSFULLY")
    print("==================================================================")


def generate_markdown_report(filepath: str, profiles: List[dict], seasons: Dict[int, Any], league_id: str):
    seasons_list = sorted(list(seasons.keys()))
    seasons_str = f"{min(seasons_list)}–{max(seasons_list)} (excl. 2021 offline)"

    lines = []
    lines.append("# 🏈 ESPN League Historical Draft Scouting Report")
    lines.append(f"**League ID:** `{league_id}` | **Historical Dataset:** {len(seasons_list)} Seasons ({seasons_str})  ")
    lines.append(f"**Generated:** September 8, 2026 | **Weighting:** Recent 3 seasons (2023–2025) weighted **2.5x** over older drafts  ")
    lines.append("")
    lines.append("> **Scouting Intelligence Notice:**  ")
    lines.append("> Identity matching is conservative and verified solely by ESPN Owner SWID. Historical seasons where ownership was unconfirmed or differed from the current manager were categorized as unlinked to prevent false attribution. Every conclusion contains verifiable raw draft counts.")
    lines.append("")
    lines.append("---")
    lines.append("## 📊 Executive Draft Board Summary")
    lines.append("")
    lines.append("| Current Team | Manager | Usable Drafts | Conf | Draft Persona | 1st QB (Wtd/Med) | 1st TE (Wtd/Med) | R1-6 RB vs WR | ADP Reach Tendency |")
    lines.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |")

    for p in profiles:
        qb_stat = p['first_pick_stats']['QB']
        te_stat = p['first_pick_stats']['TE']
        r1_6 = p['r1_6_construction']

        qb_str = f"Rd {qb_stat['weighted_avg_round']} (M:{qb_stat['median_round']})" if qb_stat['weighted_avg_round'] else "N/A"
        te_str = f"Rd {te_stat['weighted_avg_round']} (M:{te_stat['median_round']})" if te_stat['weighted_avg_round'] else "N/A"
        rb_wr_str = f"{r1_6['rb_weighted_avg']} RB / {r1_6['wr_weighted_avg']} WR"
        
        reach_val = p['adp_profile']['avg_reach_all_picks']
        reach_sign = "+" if reach_val > 0 else ""
        reach_str = f"{reach_sign}{reach_val} ({p['adp_profile']['interpretation']})"

        lines.append(f"| **{p['current_team_name']}** | {p['manager_name']} | {p['usable_drafts']}/{len(seasons_list)} | `{p['confidence']}` | **`{p['draft_label']}`** | {qb_str} | {te_str} | {rb_wr_str} | {reach_str} |")

    lines.append("")
    lines.append("---")
    lines.append("## 🔍 In-Depth Manager Scouting Profiles")
    lines.append("")

    for p in profiles:
        lines.append(f"### 🛡️ {p['current_team_name']} — {p['manager_name']}")
        lines.append(f"- **Current Team ID:** `{p['current_team_id']}` | **Owner SWID:** `{', '.join(p['owner_swids'])}`")
        lines.append(f"- **Historical Drafts Sampled:** **{p['usable_drafts']} seasons** ({', '.join(str(s) for s in p['seasons_drafted']) or 'None'})")
        lines.append(f"- **Confidence Level:** **{p['confidence']}** | **Draft-Room Label:** `{p['draft_label'].upper()}`")
        lines.append(f"- **Executive Persona:** {p['persona_rationale']}")
        lines.append("")

        if p['usable_drafts'] == 0:
            lines.append("> ⚠️ **Insufficient Evidence:** No historical drafts found under this ESPN Owner ID in this league.")
            lines.append("")
            continue

        # First positional picks table
        lines.append("#### 1. First Positional Selections (Rounds & Overall Picks)")
        lines.append("| Position | Drafts Selected | Avg Round (Wtd) | Median Round | Earliest – Latest Rd | Avg Pick Overall | Median Pick Overall |")
        lines.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
        for pos in ('QB', 'RB', 'WR', 'TE', 'K', 'DEF'):
            st = p['first_pick_stats'][pos]
            if st['count'] > 0:
                lines.append(f"| **{pos}** | {st['count']}/{p['usable_drafts']} | **Rd {st['weighted_avg_round']}** (avg {st['avg_round']}) | Rd {st['median_round']} | Rd {st['earliest_round']} – Rd {st['latest_round']} | #{st['weighted_avg_pick']} | #{st['median_pick']} |")
            else:
                lines.append(f"| **{pos}** | 0/{p['usable_drafts']} | N/A | N/A | N/A | N/A | N/A |")

        lines.append("")

        # R1-6 Construction & Openers
        r1_6 = p['r1_6_construction']
        lines.append("#### 2. Early-Round Roster Construction (Rounds 1–6)")
        lines.append(f"- **Rounds 1–6 Allocation:** Weighted Average of **{r1_6['rb_weighted_avg']} RBs** vs **{r1_6['wr_weighted_avg']} WRs** (Unweighted: {r1_6['rb_avg']} RB / {r1_6['wr_avg']} WR).")
        openers = r1_6['first_round_openers']
        lines.append(f"- **Round 1 Selection Tendency:** RB in {openers['RB']}, WR in {openers['WR']}, TE in {openers['TE']}, QB in {openers['QB']}.")
        lines.append("")

        # Positional Timing Tendencies
        et = p['early_tendencies']
        lines.append("#### 3. Positional Timing & Trigger Thresholds")
        lines.append(f"- **Early QB (Rounds 1–4):** `{et['early_qb']['pct']}%` ({et['early_qb']['count']} of {et['early_qb']['total']} drafts)")
        lines.append(f"- **Early TE (Rounds 1–4):** `{et['early_te']['pct']}%` ({et['early_te']['count']} of {et['early_te']['total']} drafts)")
        lines.append(f"- **Early Kicker (Before Round 12):** `{et['early_k']['pct']}%` ({et['early_k']['count']} of {et['early_k']['total']} drafts)")
        lines.append(f"- **Early D/ST (Before Round 12):** `{et['early_dst']['pct']}%` ({et['early_dst']['count']} of {et['early_dst']['total']} drafts)")
        lines.append("")

        # ADP Behavior
        adp_prof = p['adp_profile']
        reach_sign = "+" if adp_prof['avg_reach_all_picks'] > 0 else ""
        lines.append("#### 4. Valuation & ADP Discipline")
        lines.append(f"- **All-Rounds ADP Reach/Discount:** **{reach_sign}{adp_prof['avg_reach_all_picks']} picks** relative to consensus ({adp_prof['interpretation']}).")
        lines.append(f"- **Rounds 1–6 ADP Reach/Discount:** **{reach_sign}{adp_prof['avg_reach_r1_6']} picks**.")
        lines.append("")

        # Position Runs
        runs = p['position_runs']
        started_str = ', '.join(f"{k}: {v}x" for k, v in runs['runs_started'].items()) or "None"
        joined_str = ', '.join(f"{k}: {v}x" for k, v in runs['runs_joined'].items()) or "None"
        lines.append("#### 5. Draft Momentum & Run Behavior")
        lines.append(f"- **Runs Initiated (First of 3+ at pos):** {started_str}")
        lines.append(f"- **Runs Joined (Followed a cluster):** {joined_str}")
        lines.append("")

        # Team / Player Affinity
        lines.append("#### 6. Franchise & Player Affinities")
        if p['unusual_team_affinities']:
            for aff in p['unusual_team_affinities']:
                lines.append(f"- **NFL Team Target:** `{aff['team']}` — **{aff['picks']} total picks** ({aff['pct']}% of career drafted players; drafted 2+ players in {aff['drafts_with_multiples']} separate drafts).")
        else:
            lines.append("- **NFL Team Target:** No statistically anomalous NFL franchise affinity detected (picks evenly distributed across league).")

        if p['loyal_players']:
            loyal_str = ', '.join(f"{lp['player']} ({lp['times_drafted']}x: {', '.join(str(s) for s in lp['seasons'])})" for lp in p['loyal_players'][:4])
            lines.append(f"- **Target Player Loyalty:** {loyal_str}")
        else:
            lines.append("- **Target Player Loyalty:** High player turnover (does not fixate on the same targets across seasons).")

        lines.append("")
        lines.append("---")

    lines.append("")
    lines.append("## 💡 Tactical Draft War Room Takeaways for Tonight")
    lines.append("1. **Positional Run Antidote:** Watch managers who consistently trigger runs (see Run Initiators above). When an early QB or TE run begins, do not panic reach; let high-value RBs and WRs slide into your slot.")
    lines.append("2. **Slot #10 Strategy:** At Pick 10 and Pick 15 on the wrap, observe whether Picks 11 and 12 tend to take early QBs or double up on RBs to anticipate what will make it back to your turn.")
    lines.append("3. **Discounts vs Reaches:** Capitalize on managers with negative ADP reach profiles (they draft strictly from default queue) by sniping targets 2-3 picks ahead of their queue ADP.")
    lines.append("")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


if __name__ == '__main__':
    main()
