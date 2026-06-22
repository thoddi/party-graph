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

  static computeFutureAwareOrder(data) {
    const partyRowMap = {};
    data.elections.forEach((election) => {
      election.parties.forEach((p, idx) => {
        if (p && p.id) partyRowMap[`${election.year}-${p.id}`] = idx;
      });
    });

    function getFutureConnections(year, partyId) {
      const nextIdx = data.elections.findIndex(e => e.year === year) + 1;
      if (nextIdx <= 0 || nextIdx >= data.elections.length) return [];
      const nextYear = data.elections[nextIdx].year;
      const direct = (data.connections || [])
        .filter(c => c.from.year === year && c.from.partyId === partyId && c.to.year === nextYear)
        .map(c => c.to.partyId);
      let groupSplits = [];
      if (data.groups) {
        data.groups.forEach(g => {
          if (Math.floor(g.year) === year && g.members.includes(partyId)) {
            groupSplits = groupSplits.concat(g.splitsTo);
          }
        });
      }
      const nextElection = data.elections[nextIdx];
      const continues = nextElection.parties
        .filter(p => p && p.id === partyId)
        .map(p => p.id);
      return [...direct, ...groupSplits, ...continues];
    }

    const orders = [];
    orders.push(data.elections[0].parties.map(p => (p && p.id) ? p.id : null));
    for (let i = 1; i < data.elections.length; i++) {
      const prevOrder = orders[i - 1];
      const currParties = data.elections[i].parties;
      const bary = currParties.map((p, idx) => {
        if (!p || !p.id) return { idx, id: null, bary: idx };
        const prevIdx = prevOrder.indexOf(p.id);
        const futureConns = getFutureConnections(data.elections[i].year, p.id);
        const futureIdxs = futureConns
          .map(pid => partyRowMap[`${data.elections[i + 1]?.year}-${pid}`])
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
        if (p && p.id) partyRowMap[`${data.elections[i].year}-${p.id}`] = newOrder.indexOf(p.id);
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
