import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Running ESPN D/ST Pick Fixture & Filter Verification ---');

// 1. Load player dataset and ESPN ID mapping
const playersJsonPath = path.join(__dirname, '..', 'src', 'data', 'fantasy_players.json');
const idMapPath = path.join(__dirname, '..', 'src', 'data', 'espn_id_to_name.json');

const playersData = JSON.parse(fs.readFileSync(playersJsonPath, 'utf8'));
const espnNameMap = JSON.parse(fs.readFileSync(idMapPath, 'utf8'));

// Verify that negative D/ST IDs exist in the dataset and map
assert.equal(espnNameMap['-16001'], 'Falcons D/ST', 'ESPN map should contain Falcons D/ST as -16001');
assert.equal(espnNameMap['-16014'], 'Rams D/ST', 'ESPN map should contain Rams D/ST as -16014');

const falconsDef = playersData.players.find(p => p.espn_id === '-16001');
assert.ok(falconsDef, 'fantasy_players.json should contain Atlanta Falcons D/ST with espn_id -16001');
assert.equal(falconsDef.pos, 'DEF');

// 2. Simulated ESPN rawPicks fixture containing:
// - Future unpicked slot sentinel (-1)
// - Real offensive player (Brian Robinson Jr: 4241474)
// - Real D/ST negative ID (Falcons D/ST: -16001)
// - Real D/ST negative ID (Rams D/ST: -16014)
// - Unmatched deep D/ST negative ID (-16099)
// - Invalid/empty picks (null, 0)
const rawPicksFixture = [
  { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 7, playerId: 4241474 }, // Brian Robinson Jr
  { overallPickNumber: 2, roundId: 1, roundPickNumber: 2, teamId: 12, playerId: -16001 }, // Falcons D/ST (negative ID)
  { overallPickNumber: 3, roundId: 1, roundPickNumber: 3, teamId: 11, playerId: -16014 }, // Rams D/ST (negative ID)
  { overallPickNumber: 4, roundId: 1, roundPickNumber: 4, teamId: 8, playerId: -16099 },  // Unmatched D/ST (negative ID)
  { overallPickNumber: 5, roundId: 1, roundPickNumber: 5, teamId: 2, playerId: -1 },      // Future unmade slot sentinel
  { overallPickNumber: 6, roundId: 1, roundPickNumber: 6, teamId: 4, playerId: -1 },      // Future unmade slot sentinel
  { overallPickNumber: 7, roundId: 1, roundPickNumber: 7, teamId: 5, playerId: 0 },       // Invalid / 0
  { overallPickNumber: 8, roundId: 1, roundPickNumber: 8, teamId: 1, playerId: null },    // Unset
];

// 3. Filter condition used in route.ts and pollEspn:
const filteredPicks = rawPicksFixture.filter(
  p => p.playerId != null && Number(p.playerId) !== -1 && Number(p.playerId) !== 0
);

assert.equal(filteredPicks.length, 4, 'Should include exactly the 4 drafted picks and reject -1, 0, null');
assert.deepEqual(
  filteredPicks.map(p => p.playerId),
  [4241474, -16001, -16014, -16099],
  'Filtered picks should preserve real positive player IDs and negative D/ST IDs'
);

// 4. Test Player Reconciliation Logic (as in page.tsx)
const byEspnId = new Map();
const byNormName = new Map();

playersData.players.forEach(p => {
  if (p.espn_id) byEspnId.set(String(p.espn_id), p);
  const clean = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  byNormName.set(clean, p);
});

const reconciledHistory = [];

filteredPicks.forEach(ep => {
  let matched = byEspnId.get(String(ep.playerId));
  if (!matched && espnNameMap[String(ep.playerId)]) {
    const clean = espnNameMap[String(ep.playerId)].toLowerCase().replace(/[^a-z0-9]/g, '');
    matched = byNormName.get(clean);
  }

  if (!matched) {
    const isDefense = String(ep.playerId).startsWith('-16');
    matched = {
      id: 'espn-' + ep.playerId,
      espn_id: String(ep.playerId),
      name: espnNameMap[String(ep.playerId)] || (isDefense ? 'D/ST #' + ep.playerId : 'Player #' + ep.playerId),
      pos: isDefense ? 'DEF' : 'FLEX',
      team: isDefense ? 'DEF' : 'NFL'
    };
  }

  reconciledHistory.push({
    pickNo: ep.overallPickNumber,
    player: matched
  });
});

// Verify matches
assert.ok(reconciledHistory[0].player.name.startsWith('Brian Robinson'), 'Player 4241474 should match Brian Robinson');
assert.equal(reconciledHistory[1].player.name, 'Atlanta Falcons D/ST', 'Player -16001 should match Atlanta Falcons D/ST');
assert.equal(reconciledHistory[1].player.pos, 'DEF');
assert.equal(reconciledHistory[2].player.name, 'Los Angeles Rams D/ST', 'Player -16014 should match Los Angeles Rams D/ST');
assert.equal(reconciledHistory[2].player.pos, 'DEF');
assert.equal(reconciledHistory[3].player.pos, 'DEF', 'Unmatched -16099 should fallback to pos DEF');
assert.equal(reconciledHistory[3].player.id, 'espn--16099');

// 5. Test LocalStorage Sanitization Logic
const savedHistoryFixture = [
  { player: { id: 'espn--1', name: 'Bogus Sentinel' } },
  { player: { id: 'espn-0', name: 'Bogus Zero' } },
  { player: { id: 'ATL', name: 'Atlanta Falcons D/ST' } },
  { player: { id: 'espn--16001', name: 'Atlanta Falcons D/ST' } },
  { player: { id: '4241474', name: 'Brian Robinson Jr.' } }
];

const sanitizedHistory = savedHistoryFixture.filter(
  p => p && p.player && p.player.id && p.player.id !== 'espn--1' && p.player.id !== 'espn-0'
);

assert.equal(sanitizedHistory.length, 3, 'Sanitization should prune only espn--1 and espn-0');
assert.equal(sanitizedHistory[0].player.id, 'ATL');
assert.equal(sanitizedHistory[1].player.id, 'espn--16001', 'Sanitization must NOT prune negative D/ST IDs');
assert.equal(sanitizedHistory[2].player.id, '4241474');

console.log('✓ All ESPN D/ST fixture and filter tests passed successfully!');
