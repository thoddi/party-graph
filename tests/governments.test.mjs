import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeElections, governmentMembership } from '../src/services/election-data.js';
import { governmentPhrase } from '../src/services/datasets.js';
import { partyHistory } from '../src/services/party-history.js';

const norm = elections => normalizeElections({ elections }).elections;

test('government flags become one government', () => {
  const [e] = norm([{ date: '1950-01-01', parties: [{ id: 'a', government: true }, { id: 'b' }, { id: 'c', government: true }] }]);
  assert.deepEqual(e.governments, [{ name: null, from: null, parties: ['a', 'c'] }]);
  assert.deepEqual(governmentMembership(e, 'a'), [true]);
  assert.deepEqual(governmentMembership(e, 'b'), []);
});

test('no government at all', () => {
  const [e] = norm([{ date: '1950', parties: [{ id: 'a' }] }]);
  assert.deepEqual(e.governments, []);
  assert.deepEqual(governmentMembership(e, 'a'), []);
});

test('a list of governments gives one flag per government and sets the party flag', () => {
  const [e] = norm([{
    date: '1944-06-01', parties: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    governments: [{ name: 'Fyrri', parties: ['a', 'b'] }, { name: 'Seinni', from: '1946-02-01', parties: ['a'] }],
  }]);
  assert.deepEqual(governmentMembership(e, 'a'), [true, true]);
  assert.deepEqual(governmentMembership(e, 'b'), [true, false]);
  assert.deepEqual(governmentMembership(e, 'c'), []);
  assert.deepEqual(e.parties.map(p => p.government), [true, true, false]);
});

test('a malformed list is an error', () => {
  assert.throws(() => norm([{ date: '1944', parties: [], governments: 'x' }]), /must be a list/);
  assert.throws(() => norm([{ date: '1944', parties: [], governments: [{ name: 'x' }] }]), /needs a list/);
});

test('wording', () => {
  assert.equal(governmentPhrase('althingi', 1, 1), 'í ríkisstjórn');
  assert.equal(governmentPhrase('borgarstjorn', 1, 1), 'í meirihluta');
  assert.equal(governmentPhrase('althingi', 2, 3), 'í 2 af 3 ríkisstjórnum kjörtímabilsins');
  assert.equal(governmentPhrase('althingi', 0, 3), '');
});

test('party history says how many governments and which', () => {
  const parties = { a: { id: 'a' }, b: { id: 'b' } };
  const data = { althingi: normalizeElections({ elections: [{
    date: '1944', parties: [{ id: 'a' }, { id: 'b' }],
    governments: [{ name: 'Fyrri', parties: ['a', 'b'] }, { name: 'Seinni', parties: ['a'] }],
  }] }) };
  assert.deepEqual(partyHistory('b', parties, data).results.althingi[0].governments, { total: 2, in: 1, names: ['Fyrri'] });
  assert.deepEqual(partyHistory('a', parties, data).results.althingi[0].governments, { total: 2, in: 2, names: ['Fyrri', 'Seinni'] });
});
