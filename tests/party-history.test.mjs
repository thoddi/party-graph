import test from 'node:test';
import assert from 'node:assert/strict';
import { partyHistory } from '../src/services/party-history.js';

const parties = {
  a: { id: 'a', name: 'A', formed: 1916, logos: { 1923: 'x.png', 1950: 'x.png', 1990: 'y.png' } },
  b: { id: 'b', name: 'B', origins: [{ from: 'a', date: '1950', kind: 'defection', scope: 'althingi' }] },
  c: { id: 'c', name: 'C', origins: [{ from: 'a', date: '1940', kind: 'succession' }] },
  joint: { id: 'joint', name: 'Joint', members: ['a'] },
};
const datasets = {
  althingi: { elections: [
    { key: '1940', label: '1940', year: 1940, parties: [{ id: 'a', votes: 30, government: true }] },
    { key: '1950', label: '1950', year: 1950, parties: [{ id: 'joint', votes: 20 }, { id: 'b', votes: 5, elected: false }] },
  ] },
  borgarstjorn: { elections: [{ key: '1990', label: '1990', year: 1990, parties: [{ id: 'b', votes: 1 }] }] },
};

test('unknown party', () => assert.equal(partyHistory('zz', parties, datasets), null));

test('logos are listed once each, in order', () => {
  assert.deepEqual(partyHistory('a', parties, datasets).logos, [{ from: 1923, src: 'x.png' }, { from: 1990, src: 'y.png' }]);
});

test('origins and successors, by date', () => {
  assert.deepEqual(partyHistory('b', parties, datasets).origins.map(o => [o.id, o.name, o.kind]), [['a', 'A', 'defection']]);
  assert.deepEqual(partyHistory('a', parties, datasets).successors.map(o => o.id), ['c', 'b']);
});

test('results per tab, with joint lists and flags', () => {
  const h = partyHistory('a', parties, datasets);
  assert.equal(h.results.althingi.length, 2);
  assert.deepEqual(h.results.althingi[0], { key: '1940', label: '1940', year: 1940, votes: 30, elected: true, government: true, governments: { total: 1, in: 1, names: [] }, via: null });
  assert.equal(h.results.althingi[1].via, 'Joint');
  assert.deepEqual(h.results.borgarstjorn, []);
  assert.equal(partyHistory('b', parties, datasets).results.althingi[0].elected, false);
});
