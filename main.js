async function loadJson(url) {
  const response = await fetch(url);
  return await response.json();
}

function getPartyLogo(partyId, year, logoMap) {
  // Extract numeric year from string (e.g., "1942 (júlí)" -> 1942)
  const numericYear = typeof year === 'string' ? parseInt(year, 10) : year;
  const years = Object.keys(logoMap[partyId] || {}).map(Number).sort((a, b) => a - b);
  let logo = null;
  for (const y of years) {
    if (y <= numericYear) logo = logoMap[partyId][y];
    else break;
  }
  return logo;
}

function renderColumns(data, logoMap) {
  const columnsDiv = document.getElementById('columns');
  columnsDiv.innerHTML = '';

  data.elections.forEach((election, colIdx) => {
    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    const yearDiv = document.createElement('div');
    yearDiv.className = 'year';
    yearDiv.textContent = election.year;
    colDiv.appendChild(yearDiv);

    election.parties.forEach((party, partyIdx) => {
      // If party is empty ({}), render invisible box
      if (!party || Object.keys(party).length === 0 || !party.id) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'party empty-party';
        colDiv.appendChild(emptyDiv);
        return;
      }
      const partyDiv = document.createElement('div');
      partyDiv.className = 'party';
      partyDiv.id = `party-${election.year}-${party.id}`;
      // government: yellow/golden hue
      if (party.government === true) partyDiv.classList.add('government');
      // elected: default true
      const elected = party.elected !== false;
      if (!elected) partyDiv.classList.add('elected-false');
      const logo = getPartyLogo(party.id, election.year, logoMap);
      if (logo) {
        const img = document.createElement('img');
        img.src = logo;
        img.alt = party.name || '';
        partyDiv.appendChild(img);
      }
      const nameDiv = document.createElement('div');
      nameDiv.textContent = party.name || '';
      partyDiv.appendChild(nameDiv);
      const votesDiv = document.createElement('div');
      votesDiv.textContent = party.votes;
      partyDiv.appendChild(votesDiv);
      colDiv.appendChild(partyDiv);
    });
    columnsDiv.appendChild(colDiv);
  });
}

function getBoxEdgeCenter(element, direction) {
  // direction: 'left' or 'right'
  const rect = element.getBoundingClientRect();
  const parentRect = element.offsetParent.getBoundingClientRect();
  const x = direction === 'left' ? rect.left - parentRect.left : rect.right - parentRect.left;
  const y = rect.top - parentRect.top + rect.height / 2;
  return { x, y };
}

function drawGroups(data, columnsDiv, partyBoxes, svg) {
  if (!data.groups) return;
  // Ensure SVG is wide enough
  svg.setAttribute('width', columnsDiv.scrollWidth);
  svg.setAttribute('height', columnsDiv.scrollHeight);

  data.groups.forEach(group => {
    // Find columns before and after group.year
    let prevColIdx = -1, nextColIdx = -1;
    for (let i = 0; i < data.elections.length - 1; i++) {
      if (group.year > data.elections[i].year && group.year < data.elections[i + 1].year) {
        prevColIdx = i;
        nextColIdx = i + 1;
        break;
      }
    }
    if (prevColIdx === -1 || nextColIdx === -1) return;
    const prevCol = columnsDiv.children[prevColIdx];
    const nextCol = columnsDiv.children[nextColIdx];
    const prevRect = prevCol.getBoundingClientRect();
    const nextRect = nextCol.getBoundingClientRect();
    const containerRect = columnsDiv.getBoundingClientRect();
    // True horizontal center between right edge of prevCol and left edge of nextCol
    const x = ((prevRect.right + nextRect.left) / 2) - containerRect.left;
    let y;
    if (typeof group.row === 'number') {
      // Find the party box in nextCol at row index
      const partyDivs = Array.from(nextCol.querySelectorAll('.party'));
      if (partyDivs[group.row]) {
        const rect = partyDivs[group.row].getBoundingClientRect();
        y = rect.top - containerRect.top + rect.height / 2;
      } else {
        // fallback: center
        y = ((prevRect.top + nextRect.top + prevRect.bottom + nextRect.bottom) / 4) - containerRect.top;
      }
    } else {
      // fallback: center
      y = ((prevRect.top + nextRect.top + prevRect.bottom + nextRect.bottom) / 4) - containerRect.top;
    }
    const r = 18;
    // Draw circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', '#d22');
    circle.setAttribute('stroke', '#333');
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);
    if (group.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y + 30);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '14px');
      text.textContent = group.label;
      svg.appendChild(text);
    }
    // Draw dashed lines from members to left edge of group circle
    group.members.forEach(pid => {
      const partyBox = partyBoxes[`${data.elections[prevColIdx].year}-${pid}`];
      if (!partyBox) return;
      const from = getBoxEdgeCenter(partyBox, 'right');
      // Calculate left edge of circle
      const to = { x: x - r, y: y };
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6,4');
      svg.appendChild(line);
    });
    // Draw dashed lines from right edge of group circle to splitsTo
    group.splitsTo.forEach(pid => {
      const partyBox = partyBoxes[`${data.elections[nextColIdx].year}-${pid}`];
      if (!partyBox) return;
      const to = getBoxEdgeCenter(partyBox, 'left');
      // Calculate right edge of circle
      const from = { x: x + r, y: y };
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6,4');
      svg.appendChild(line);
    });
  });
}

function drawConnections(data, logoMap) {
  const svg = document.getElementById('svg-lines');
  svg.innerHTML = '';
  const columnsDiv = document.getElementById('columns');
  const columns = Array.from(columnsDiv.children);
  const partyBoxes = {};

  columns.forEach((colDiv, colIdx) => {
    const year = data.elections[colIdx].year;
    Array.from(colDiv.querySelectorAll('.party')).forEach((partyDiv, partyIdx) => {
      partyBoxes[`${year}-${partyDiv.id.split('-').pop()}`] = partyDiv;
    });
  });

  svg.setAttribute('width', columnsDiv.scrollWidth);
  svg.setAttribute('height', columnsDiv.scrollHeight);

  // --- Popover logic ---
  let popover = document.getElementById('svg-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'svg-popover';
    document.body.appendChild(popover);
  }
  function showPopover(text, evt) {
    popover.textContent = text;
    popover.style.display = 'block';
    const pad = 12;
    popover.style.left = (evt.clientX + pad) + 'px';
    popover.style.top = (evt.clientY + pad) + 'px';
  }
  function hidePopover() {
    popover.style.display = 'none';
  }

  function drawLine(fromBox, toBox, type, description) {
    if (!fromBox || !toBox) return;
    const from = getBoxEdgeCenter(fromBox, 'right');
    const to = getBoxEdgeCenter(toBox, 'left');
    // Draw the visible line (thin)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('stroke', '#333');
    line.setAttribute('stroke-width', '2');
    if (type === 'dashed') {
      line.setAttribute('stroke-dasharray', '6,4');
    }
    svg.appendChild(line);
    // Draw the invisible thick hit area for hover
    if (description) {
      const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hitLine.setAttribute('x1', from.x);
      hitLine.setAttribute('y1', from.y);
      hitLine.setAttribute('x2', to.x);
      hitLine.setAttribute('y2', to.y);
      hitLine.setAttribute('stroke', 'transparent');
      hitLine.setAttribute('stroke-width', '16');
      hitLine.setAttribute('pointer-events', 'stroke');
      if (type === 'dashed') {
        hitLine.setAttribute('stroke-dasharray', '6,4');
      }
      hitLine.style.cursor = 'pointer';
      hitLine.addEventListener('mousemove', evt => showPopover(description, evt));
      hitLine.addEventListener('mouseleave', hidePopover);
      svg.appendChild(hitLine);
    }
  }

  // Draw explicit connections
  data.connections.forEach(conn => {
    const fromBox = partyBoxes[`${conn.from.year}-${conn.from.partyId}`];
    const toBox = partyBoxes[`${conn.to.year}-${conn.to.partyId}`];
    drawLine(fromBox, toBox, conn.type, conn.description);
  });

  // Draw automatic solid lines for same party in consecutive years
  for (let i = 1; i < data.elections.length; i++) {
    const prev = data.elections[i - 1];
    const curr = data.elections[i];
    prev.parties.forEach(prevParty => {
      const currParty = curr.parties.find(p => p.id === prevParty.id);
      if (currParty) {
        const fromBox = partyBoxes[`${prev.year}-${prevParty.id}`];
        const toBox = partyBoxes[`${curr.year}-${currParty.id}`];
        drawLine(fromBox, toBox, 'solid');
      }
    });
  }

  // Draw groups
  drawGroups(data, columnsDiv, partyBoxes, svg);
}

// Try to load party order from party_order.json if it exists
let partyOrderOverride = null;
async function tryLoadPartyOrder() {
  try {
    const resp = await fetch('party_order.json');
    if (resp.ok) {
      partyOrderOverride = await resp.json();
    }
  } catch (e) { /* ignore */ }
}

// Barycenter/Median ordering algorithm
function computeBarycenterOrder(data) {
  // For each year, order parties to minimize distance to previous year
  const orders = [];
  // Start with current order for first year
  orders.push(data.elections[0].parties.map((p, i) => p && p.id ? p.id : null));
  for (let i = 1; i < data.elections.length; i++) {
    const prevOrder = orders[i - 1];
    const currParties = data.elections[i].parties;
    // For each party, find index in prevOrder (if exists)
    const bary = currParties.map((p, idx) => {
      if (!p || !p.id) return { idx, id: null, bary: idx };
      const prevIdx = prevOrder.indexOf(p.id);
      return { idx, id: p.id, bary: prevIdx === -1 ? idx : prevIdx };
    });
    // Sort by barycenter (median of previous positions)
    bary.sort((a, b) => a.bary - b.bary);
    // Build new order
    const newOrder = bary.map(x => x.id);
    orders.push(newOrder);
  }
  return orders;
}

// Apply a party order (array of arrays of party ids/nulls) to data.elections
function applyPartyOrder(data, order) {
  data.elections.forEach((election, i) => {
    if (!order[i]) return;
    // Build new party array in order
    const idToParty = {};
    election.parties.forEach(p => { if (p && p.id) idToParty[p.id] = p; });
    const newParties = order[i].map(id => id ? idToParty[id] : {});
    // If order is shorter than parties, append leftovers
    if (newParties.length < election.parties.length) {
      for (const p of election.parties) {
        if (p && p.id && !order[i].includes(p.id)) newParties.push(p);
      }
    }
    election.parties = newParties;
  });
}

// Modal logic for optimal ordering
function setupOptimizeModal(data, logoMap, rerender) {
  const btn = document.getElementById('optimize-order-btn');
  const modal = document.getElementById('optimize-modal');
  const closeBtn = document.getElementById('close-optimize-modal');
  const runBtn = document.getElementById('run-optimize');
  const resultDiv = document.getElementById('optimize-result');
  const actionsDiv = document.getElementById('optimize-actions');
  const applyBtn = document.getElementById('apply-order');
  const downloadBtn = document.getElementById('download-order');
  let lastOrder = null;

  btn.onclick = () => { modal.style.display = 'flex'; resultDiv.innerHTML = ''; actionsDiv.style.display = 'none'; };
  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  runBtn.onclick = () => {
    const algo = document.querySelector('input[name=algo]:checked').value;
    let order = null;
    if (algo === 'barycenter') {
      order = computeBarycenterOrder(data);
    } else if (algo === 'greedy') {
      // Placeholder for future
      order = computeBarycenterOrder(data);
    } else {
      // Placeholder for custom
      order = computeBarycenterOrder(data);
    }
    lastOrder = order;
    resultDiv.innerHTML = '<b>Röðun reiknuð!</b>';
    actionsDiv.style.display = '';
  };
  applyBtn.onclick = () => {
    if (lastOrder) {
      applyPartyOrder(data, lastOrder);
      rerender();
      modal.style.display = 'none';
    }
  };
  downloadBtn.onclick = () => {
    if (lastOrder) {
      const blob = new Blob([JSON.stringify(lastOrder, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'party_order.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }
  };
  // Import order from textarea
  const importBtn = document.getElementById('import-order-btn');
  const importArea = document.getElementById('import-order-json');
  importBtn.onclick = () => {
    try {
      const order = JSON.parse(importArea.value);
      lastOrder = order;
      resultDiv.innerHTML = '<b>Röðun úr JSON skrá lesin!</b>';
      actionsDiv.style.display = '';
    } catch (e) {
      resultDiv.innerHTML = '<span style="color:red">Villa í JSON!</span>';
    }
  };
}

async function main() {
  await tryLoadPartyOrder();
  const [data, logoMap] = await Promise.all([
    loadJson('data.json'),
    loadJson('party_logos.json')
  ]);
  // Ef partyOrderOverride er til, nota hana
  if (partyOrderOverride) {
    applyPartyOrder(data, partyOrderOverride);
  }
  renderColumns(data, logoMap);
  setTimeout(() => drawConnections(data, logoMap), 100);
  setupOptimizeModal(data, logoMap, () => {
    renderColumns(data, logoMap);
    setTimeout(() => drawConnections(data, logoMap), 100);
  });
}

window.onload = main;
