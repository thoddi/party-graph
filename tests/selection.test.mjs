import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, selectionFor } from '../src/services/graph-model.js';

const parties = {
  a: { id: 'a' },
  b: { id: 'b', origins: [{ from: 'a', date: '1950-01-01', kind: 'defection', scope: 'althingi' }] },
  c: { id: 'c' },
  joint: { id: 'joint', members: ['c'] },
};
const data = { elections: [
  { date: '1940-01-01', key: '1940', parties: [{ id: 'a' }, { id: 'c' }] },
  { date: '1950-01-01', key: '1950', parties: [{ id: 'a' }, { id: 'b' }, { id: 'joint' }] },
  { date: '1960-01-01', key: '1960', parties: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
] };
const graph = buildGraph(data, parties, 'althingi');

test('a party selects its own cards and lines', () => {
  const sel = selectionFor(graph, 'a');
  assert.deepEqual([...sel.cards].sort(), ['1940-a', '1950-a', '1960-a']);
  // continuation a→a twice, and the defection a→b
  assert.equal(sel.edges.length, 3);
  assert.deepEqual([...sel.related], ['1950-b']);
});

test('a card of the origin shows up as related, one step only', () => {
  const sel = selectionFor(graph, 'b');
  assert.deepEqual([...sel.cards].sort(), ['1950-b', '1960-b']);
  assert.ok(sel.related.has('1940-a') || sel.related.has('1950-a'));
  assert.ok(!sel.related.has('1960-a'));
});

test('a joint list counts as the member party', () => {
  const sel = selectionFor(graph, 'c');
  assert.ok(sel.cards.has('1950-joint'));
  assert.equal(sel.edges.length, 2);
});

test('an unknown party selects nothing', () => {
  assert.equal(selectionFor(graph, 'zzz'), null);
});
