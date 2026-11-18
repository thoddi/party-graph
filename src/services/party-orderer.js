/**
 * PartyOrderer — algorithms for optimal party ordering to minimize line crossings.
 */
class PartyOrderer {
  static computeBarycenterOrder(data) {
    const orders = [];
    orders.push(data.elections[0].parties.map(p => (p && p.id) ? p.id : null));
    for (let i = 1; i < data.elections.length; i++) {
      const prevOrder = orders[i - 1];
      const currParties = data.elections[i].parties;
      const bary = currParties.map((p, idx) => {
        if (!p || !p.id) return { idx, id: null, bary: idx };
        const prevIdx = prevOrder.indexOf(p.id);
        return { idx, id: p.id, bary: prevIdx === -1 ? idx : prevIdx };
      });
      bary.sort((a, b) => a.bary - b.bary);
      orders.push(bary.map(x => x.id));
    }
    return orders;
  }

  /**
   * @param {Object} data  the election data
   * @param {Object} graph the graph model for the same tab (see graph-model.js)
   */
  static computeFutureAwareOrder(data, graph) {
    const partyRowMap = {};
    data.elections.forEach((election) => {
      election.parties.forEach((p, idx) => {
        if (p && p.id) partyRowMap[`${election.key}-${p.id}`] = idx;
      });
    });

    // Parties in the next column that this party is joined to: by a line (a continuation
    // is also a line), or through a group node.
    function getFutureConnections(key, partyId) {
      const currIdx = data.elections.findIndex(e => e.key === key);
      const nextIdx = currIdx + 1;
      if (currIdx < 0 || nextIdx >= data.elections.length) return [];
      const nextKey = data.elections[nextIdx].key;
      const direct = graph.edges
        .filter(e => e.fromKey === key && e.fromId === partyId && e.toKey === nextKey)
        .map(e => e.toId);
      const viaNodes = graph.nodes
        .filter(n => n.prevKey === key && n.nextKey === nextKey && n.sources.some(s => s.id === partyId))
        .flatMap(n => n.targets.map(t => t.id));
      return [...direct, ...viaNodes];
    }

    const orders = [];
    orders.push(data.elections[0].parties.map(p => (p && p.id) ? p.id : null));
    for (let i = 1; i < data.elections.length; i++) {
      const prevOrder = orders[i - 1];
      const currParties = data.elections[i].parties;
      const bary = currParties.map((p, idx) => {
        if (!p || !p.id) return { idx, id: null, bary: idx };
        const prevIdx = prevOrder.indexOf(p.id);
        const futureConns = getFutureConnections(data.elections[i].key, p.id);
        const futureIdxs = futureConns
          .map(pid => partyRowMap[`${data.elections[i + 1]?.key}-${pid}`])
          .filter(x => typeof x === 'number');
        const futureBary = futureIdxs.length > 0
          ? futureIdxs.reduce((a, b) => a + b, 0) / futureIdxs.length
          : idx;
        const score = (prevIdx === -1 ? idx : prevIdx) * 2 / 3 + futureBary / 3;
        return { idx, id: p.id, bary: score };
      });
      bary.sort((a, b) => a.bary - b.bary);
      const newOrder = bary.map(x => x.id);
      orders.push(newOrder);
      data.elections[i].parties.forEach((p) => {
        if (p && p.id) partyRowMap[`${data.elections[i].key}-${p.id}`] = newOrder.indexOf(p.id);
      });
    }
    return orders;
  }

  static applyPartyOrder(data, order) {
    data.elections.forEach((election, i) => {
      if (!order[i]) return;
      const idToParty = {};
      election.parties.forEach(p => { if (p && p.id) idToParty[p.id] = p; });
      const newParties = order[i].map(id => id ? idToParty[id] : {});
      if (newParties.length < election.parties.length) {
        for (const p of election.parties) {
          if (p && p.id && !order[i].includes(p.id)) newParties.push(p);
        }
      }
      election.parties = newParties;
    });
  }
}

export default PartyOrderer;
