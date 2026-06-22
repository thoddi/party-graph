const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
      z-index: 0;
    }
    svg {
      display: block;
    }
    .hit-line {
      cursor: pointer;
      pointer-events: stroke;
    }
  </style>
  <svg></svg>
`;

/**
 * <connection-layer> — SVG overlay that draws all connection lines and group nodes.
 *
 * Lines are NOT individual components because:
 * - They are relational (span across party cards in different columns)
 * - They share a single SVG canvas for proper z-ordering
 * - Their positions depend on the layout of other components
 * - A single SVG surface is far more performant than many individual elements
 *
 * Instead, this component owns one SVG and exposes a `draw()` method that
 * accepts the full data model and references to column elements, then
 * renders all lines, hit areas, and group circles internally.
 */
class ConnectionLayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._svg = this.shadowRoot.querySelector('svg');
    this._popover = null;
  }

  connectedCallback() {
    this._popover = document.createElement('div');
    Object.assign(this._popover.style, {
      position: 'fixed',
      pointerEvents: 'none',
      background: '#fffbe6',
      color: '#333',
      border: '1px solid #ffe066',
      borderRadius: '6px',
      boxShadow: '0 2px 8px #0002',
      padding: '8px 12px',
      fontSize: '15px',
      zIndex: '10000',
      display: 'none',
      maxWidth: '320px',
      whiteSpace: 'pre-line',
    });
    document.body.appendChild(this._popover);
  }

  disconnectedCallback() {
    if (this._popover && this._popover.parentNode) {
      this._popover.parentNode.removeChild(this._popover);
    }
  }

  /**
   * Draw all connections, groups, and auto-links.
   * @param {Object} data - The election data (elections, connections, groups)
   * @param {HTMLElement[]} columnElements - Array of <election-column> elements
   * @param {HTMLElement} container - The container element for coordinate calculation
   */
  draw(data, columnElements, container) {
    this._svg.innerHTML = '';
    if (!data || !columnElements || !container) return;

    const containerRect = container.getBoundingClientRect();
    const width = container.scrollWidth;
    const height = container.scrollHeight;

    this._svg.setAttribute('width', width);
    this._svg.setAttribute('height', height);
    this.style.width = width + 'px';
    this.style.height = height + 'px';

    const partyBoxes = this._collectPartyBoxes(data, columnElements, containerRect);

    // Draw explicit connections
    if (data.connections) {
      data.connections.forEach(conn => {
        const fromBox = partyBoxes[`${conn.from.year}-${conn.from.partyId}`];
        const toBox = partyBoxes[`${conn.to.year}-${conn.to.partyId}`];
        this._drawLine(fromBox, toBox, conn.type, conn.description, containerRect);
      });
    }

    // Draw auto connections (same party in consecutive elections)
    for (let i = 1; i < data.elections.length; i++) {
      const prev = data.elections[i - 1];
      const curr = data.elections[i];
      prev.parties.forEach(prevParty => {
        if (!prevParty || !prevParty.id) return;
        const currParty = curr.parties.find(p => p && p.id === prevParty.id);
        if (currParty) {
          const fromBox = partyBoxes[`${prev.year}-${prevParty.id}`];
          const toBox = partyBoxes[`${curr.year}-${currParty.id}`];
          this._drawLine(fromBox, toBox, 'solid', null, containerRect);
        }
      });
    }

    // Draw groups
    this._drawGroups(data, columnElements, partyBoxes, containerRect);
  }

  _collectPartyBoxes(data, columnElements, containerRect) {
    const boxes = {};
    columnElements.forEach((col, colIdx) => {
      if (!data.elections[colIdx]) return;
      const year = data.elections[colIdx].year;
      const cards = col.getPartyCardElements();
      data.elections[colIdx].parties.forEach((party, pIdx) => {
        if (party && party.id && cards[pIdx]) {
          boxes[`${year}-${party.id}`] = cards[pIdx];
        }
      });
    });
    return boxes;
  }

  _getBoxCenter(element, containerRect) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top + rect.height / 2
    };
  }

  _drawLine(fromBox, toBox, type, description, containerRect) {
    if (!fromBox || !toBox) return;
    const from = this._getBoxCenter(fromBox, containerRect);
    const to = this._getBoxCenter(toBox, containerRect);

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
    this._svg.appendChild(line);

    if (description) {
      const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hitLine.setAttribute('x1', from.x);
      hitLine.setAttribute('y1', from.y);
      hitLine.setAttribute('x2', to.x);
      hitLine.setAttribute('y2', to.y);
      hitLine.setAttribute('stroke', 'transparent');
      hitLine.setAttribute('stroke-width', '16');
      hitLine.setAttribute('pointer-events', 'stroke');
      hitLine.classList.add('hit-line');
      hitLine.addEventListener('mousemove', evt => this._showPopover(description, evt));
      hitLine.addEventListener('mouseleave', () => this._hidePopover());
      this._svg.appendChild(hitLine);
    }
  }

  _drawGroups(data, columnElements, partyBoxes, containerRect) {
    if (!data.groups) return;

    data.groups.forEach(group => {
      let prevColIdx = -1, nextColIdx = -1;
      for (let i = 0; i < data.elections.length - 1; i++) {
        if (group.year > data.elections[i].year && group.year < data.elections[i + 1].year) {
          prevColIdx = i;
          nextColIdx = i + 1;
          break;
        }
      }
      if (prevColIdx === -1 || nextColIdx === -1) return;

      const prevCol = columnElements[prevColIdx];
      const nextCol = columnElements[nextColIdx];
      if (!prevCol || !nextCol) return;

      const prevRect = prevCol.getBoundingClientRect();
      const nextRect = nextCol.getBoundingClientRect();
      const x = ((prevRect.right + nextRect.left) / 2) - containerRect.left;

      let yPositions = [];
      group.members.forEach(pid => {
        const box = partyBoxes[`${data.elections[prevColIdx].year}-${pid}`];
        if (box) yPositions.push(this._getBoxCenter(box, containerRect).y);
      });
      group.splitsTo.forEach(pid => {
        const box = partyBoxes[`${data.elections[nextColIdx].year}-${pid}`];
        if (box) yPositions.push(this._getBoxCenter(box, containerRect).y);
      });

      let y;
      if (yPositions.length > 0) {
        y = yPositions.reduce((a, b) => a + b, 0) / yPositions.length;
      } else {
        y = ((prevRect.top + nextRect.top + prevRect.bottom + nextRect.bottom) / 4) - containerRect.top;
      }

      const r = 18;

      // Lines from members to group center
      group.members.forEach(pid => {
        const box = partyBoxes[`${data.elections[prevColIdx].year}-${pid}`];
        if (!box) return;
        const from = this._getBoxCenter(box, containerRect);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', from.x);
        line.setAttribute('y1', from.y);
        line.setAttribute('x2', x);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#333');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6,4');
        this._svg.appendChild(line);
      });

      // Lines from group center to splitsTo
      group.splitsTo.forEach(pid => {
        const box = partyBoxes[`${data.elections[nextColIdx].year}-${pid}`];
        if (!box) return;
        const to = this._getBoxCenter(box, containerRect);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', y);
        line.setAttribute('x2', to.x);
        line.setAttribute('y2', to.y);
        line.setAttribute('stroke', '#333');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6,4');
        this._svg.appendChild(line);
      });

      // Group circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', '#d22');
      circle.setAttribute('stroke', '#333');
      circle.setAttribute('stroke-width', '2');
      this._svg.appendChild(circle);

      // Group label
      if (group.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + 30);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '14px');
        text.textContent = group.label;
        this._svg.appendChild(text);
      }
    });
  }

  _showPopover(text, evt) {
    this._popover.textContent = text;
    this._popover.style.display = 'block';
    this._popover.style.left = (evt.clientX + 12) + 'px';
    this._popover.style.top = (evt.clientY + 12) + 'px';
  }

  _hidePopover() {
    this._popover.style.display = 'none';
  }
}

customElements.define('connection-layer', ConnectionLayer);
export default ConnectionLayer;
