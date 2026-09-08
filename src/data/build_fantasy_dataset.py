import urllib.request
import json
import re
import os

print("Starting Custom ESPN Calibrated Fantasy Football Dataset Build...")

bye_map = {
    'ARI': 14, 'ATL': 11, 'BAL': 13, 'BUF': 7, 'CAR': 5, 'CHI': 10,
    'CIN': 6, 'CLE': 11, 'DAL': 14, 'DEN': 10, 'DET': 6, 'GB': 11,
    'HOU': 8, 'IND': 13, 'JAX': 7, 'KC': 5, 'LAC': 7, 'LAR': 11,
    'LV': 13, 'MIA': 6, 'MIN': 6, 'NE': 11, 'NO': 8, 'NYG': 8,
    'NYJ': 13, 'PHI': 10, 'PIT': 9, 'SEA': 11, 'SF': 8, 'TB': 10,
    'TEN': 9, 'WAS': 7
}

print("Fetching Sleeper NFL players...")
req_p = urllib.request.Request('https://api.sleeper.app/v1/players/nfl', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req_p, timeout=25) as resp:
    players = json.loads(resp.read().decode('utf-8'))

print("Fetching Sleeper 2026 season projections...")
req_proj = urllib.request.Request('https://api.sleeper.app/v1/projections/nfl/regular/2026', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req_proj, timeout=25) as resp:
    projs = json.loads(resp.read().decode('utf-8'))

print("Fetching ESPN NFL player database for ID mapping...")
req_espn = urllib.request.Request(
    'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/players?scoringPeriodId=0&view=players_wl',
    headers={
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'x-fantasy-filter': json.dumps({'filterActive': {'value': True}})
    }
)
with urllib.request.urlopen(req_espn, timeout=25) as resp:
    espn_players = json.loads(resp.read().decode('utf-8'))

def clean_name(n):
    n = n.lower()
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?', '', n)
    return ''.join(c for c in n if c.isalnum())

espn_name_map = {}
espn_def_map = {}
for ep in espn_players:
    cn = clean_name(ep.get('fullName', ''))
    if cn:
        espn_name_map[cn] = str(ep['id'])
    if ep.get('defaultPositionId') == 16:
        fn = ep.get('fullName', '').lower()
        espn_def_map[fn] = str(ep['id'])

valid_pos = {'QB', 'RB', 'WR', 'TE', 'K', 'DEF'}
raw_pool = []

for pid, p in players.items():
    pos = p.get('position')
    if pos not in valid_pos:
        continue
    
    if pos == 'DEF':
        team = pid
        city = p.get('first_name', team)
        mascot = p.get('last_name', 'Defense')
        name = f"{city} {mascot} D/ST"
    else:
        team = p.get('team')
        name = p.get('full_name')
        if not name:
            continue
    
    proj = projs.get(pid, {})
    
    # ADP values
    adp_ppr = proj.get('adp_ppr') or proj.get('adp_dd_ppr') or (p.get('search_rank') if p.get('search_rank') else 999.0)
    adp_half = proj.get('adp_half_ppr') or adp_ppr
    adp_std = proj.get('adp_std') or adp_half
    
    # Points
    base_ppr = float(proj.get('pts_ppr', 0.0) or 0.0)
    base_half = float(proj.get('pts_half_ppr', 0.0) or 0.0)
    base_std = float(proj.get('pts_std', 0.0) or 0.0)
    
    # Pass TD bonus for 6-pt Passing TD league (+2 pts per pass TD)
    pass_td = float(proj.get('pass_td', 0.0) or 0.0) if pos == 'QB' else 0.0
    pass_td_bonus = pass_td * 2.0
    
    pts_ppr = round(base_ppr + pass_td_bonus, 1)
    pts_half = round(base_half + pass_td_bonus, 1)
    pts_std = round(base_std + pass_td_bonus, 1)
    
    search_rank = p.get('search_rank')
    
    # Quality filter
    if pts_half <= 5.0 and (not search_rank or search_rank > 450) and (not adp_half or adp_half > 350):
        continue
    
    bye = bye_map.get(team, 0)
    injury = p.get('injury_status')
    
    # Map ESPN ID
    espn_id = None
    cn = clean_name(name)
    if cn in espn_name_map:
        espn_id = espn_name_map[cn]
    elif pos == 'DEF':
        for dfn, did in espn_def_map.items():
            if (team and team.lower() in dfn) or (city and city.lower() in dfn) or (mascot and mascot.lower() in dfn):
                espn_id = did
                break
    
    raw_pool.append({
        'id': pid,
        'espn_id': espn_id,
        'name': name,
        'pos': pos,
        'team': team or 'FA',
        'bye': bye,
        'search_rank': search_rank or 9999,
        'adp_ppr': round(float(adp_ppr), 1),
        'adp_half': round(float(adp_half), 1),
        'adp_std': round(float(adp_std), 1),
        'pts_ppr': pts_ppr,
        'pts_half': pts_half,
        'pts_std': pts_std,
        'pass_td': pass_td,
        'injury': injury,
        'age': p.get('age'),
        'years_exp': p.get('years_exp', 0),
        'depth': p.get('depth_chart_order', 1)
    })

print(f"Total raw players filtered: {len(raw_pool)}")

pos_groups = {pos: [] for pos in valid_pos}
for p in raw_pool:
    pos_groups[p['pos']].append(p)

# Sort each group by ADP (PPR priority for Cooper Manning's Revenge)
for pos in pos_groups:
    pos_groups[pos].sort(key=lambda x: (x['adp_ppr'] if x['adp_ppr'] > 0 else 999, -x['pts_ppr']))

# 12 Team League replacement thresholds:
# 1 QB (12th-13th)
# 2 RB + FLEX (~32 RBs)
# 2 WR + FLEX (~36 WRs)
# 1 TE (12th-13th)
# 1 K, 1 DEF
repl_thresholds = {
    'QB': 12,   # 13th QB
    'RB': 31,   # 32nd RB
    'WR': 35,   # 36th WR (2WR + Flex)
    'TE': 12,   # 13th TE
    'K': 12,    # 13th K
    'DEF': 12   # 13th DEF
}

baselines = {}
for pos, idx in repl_thresholds.items():
    grp = pos_groups[pos]
    if len(grp) > idx:
        baselines[pos] = {
            'ppr': grp[idx]['pts_ppr'],
            'half': grp[idx]['pts_half'],
            'std': grp[idx]['pts_std']
        }
    elif len(grp) > 0:
        baselines[pos] = {
            'ppr': grp[-1]['pts_ppr'],
            'half': grp[-1]['pts_half'],
            'std': grp[-1]['pts_std']
        }
    else:
        baselines[pos] = {'ppr': 0, 'half': 0, 'std': 0}

print("Replacement baselines with 6-pt Pass TD:", baselines)

final_players = []

for pos, grp in pos_groups.items():
    base = baselines[pos]
    for idx, p in enumerate(grp, start=1):
        p['pos_rank'] = f"{pos}{idx}"
        p['pos_rank_num'] = idx
        
        # Calculate VORP
        p['vorp_ppr'] = round(p['pts_ppr'] - base['ppr'], 1)
        p['vorp_half'] = round(p['pts_half'] - base['half'], 1)
        p['vorp_std'] = round(p['pts_std'] - base['std'], 1)
        
        # Assign Tier
        if pos == 'RB':
            if idx <= 3: tier = 1
            elif idx <= 12: tier = 2
            elif idx <= 24: tier = 3
            elif idx <= 36: tier = 4
            elif idx <= 50: tier = 5
            else: tier = 6
        elif pos == 'WR':
            if idx <= 6: tier = 1
            elif idx <= 16: tier = 2
            elif idx <= 30: tier = 3
            elif idx <= 45: tier = 4
            elif idx <= 60: tier = 5
            else: tier = 6
        elif pos == 'QB':
            if idx <= 3: tier = 1
            elif idx <= 7: tier = 2
            elif idx <= 14: tier = 3
            elif idx <= 22: tier = 4
            else: tier = 5
        elif pos == 'TE':
            if idx <= 2: tier = 1
            elif idx <= 6: tier = 2
            elif idx <= 12: tier = 3
            elif idx <= 20: tier = 4
            else: tier = 5
        elif pos in ('K', 'DEF'):
            if idx <= 4: tier = 1
            elif idx <= 12: tier = 2
            elif idx <= 20: tier = 3
            else: tier = 4
        else:
            tier = 6
            
        p['tier'] = tier
        final_players.append(p)

# Global sort by ADP (PPR)
final_players.sort(key=lambda x: (x['adp_ppr'] if x['adp_ppr'] > 0 else 999, -x['vorp_ppr']))

trimmed_players = final_players[:380]

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fantasy_players.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({
        'updated_at': '2026-09-08',
        'season': '2026',
        'league': "Cooper Manning's Revenge",
        'scoring_note': "1.0 PPR with 6-pt Passing TDs",
        'total_players': len(trimmed_players),
        'baselines': baselines,
        'bye_map': bye_map,
        'players': trimmed_players
    }, f, indent=2)

print(f"Successfully calibrated and wrote {len(trimmed_players)} fantasy players to {out_path}")
