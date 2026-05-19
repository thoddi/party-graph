class PartyOrderer {
  static computeBarycenterOrder(data) {
    const orders = [];
    orders.push(data.elections[0].parties.map((p) => p && p.id ? p.id : null));
    for (let i = 1; i < data.elections.length; i++) {
      const prevOrder = orders[i - 1];
      const currParties = data.elections[i].parties;
      const bary = currParties.map((p, idx) => {
        if (!p || !p.id) return { idx, id: null, bary: idx };
        const prevIdx = prevOrder.indexOf(p.id);
        return { idx, id: p.id, bary: prevIdx === -1 ? idx : prevIdx };
      });
      bary.sort((a, b) => a.bary - b.bary);
      const newOrder = bary.map(x => x.id);
      orders.push(newOrder);
    }
    return orders;
  }

  // ...computeFutureAwareOrder, applyPartyOrder
}

export default PartyOrderer;
