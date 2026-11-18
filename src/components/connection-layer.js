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
 * accepts the graph model (see services/graph-model.js) and references to
 * column elements, then renders all lines, hit areas, and group circles internally.
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
   * Draw all lines and group nodes.
   * @param {Object} graph - The graph model from buildGraph(): elections, edges and nodes
   * @param {HTMLElement[]} columnElements - Array of <election-column> elements
   * @param {HTMLElement} container - The container element for coordinate calculation
   */
  draw(graph, columnElements, container) {
    this._svg.innerHTML = '';
    if (!graph || !columnElements || !container) return;

    const containerRect = container.getBoundingClientRect();
    const width = container.scrollWidth;
    const height = container.scrollHeight;

    this._svg.setAttribute('width', width);
    this._svg.setAttribute('height', height);
    this.style.width = width + 'px';
    this.style.height = height + 'px';

    const partyBoxes = this._collectPartyBoxes(graph.elections, columnElements);

    graph.edges.forEach(edge => {
      const fromBox = partyBoxes[`${edge.fromKey}-${edge.fromId}`];
      const toBox = partyBoxes[`${edge.toKey}-${edge.toId}`];
      if (!fromBox || !toBox) return;
      const from = this._getBoxCenter(fromBox, containerRect);
      const to = this._getBoxCenter(toBox, containerRect);
      this._drawLine(from, to, edge.kind === 'defection');
      if (edge.description) this._drawHitLine(from, to, edge.description);
    });

    this._drawNodes(graph, columnElements, partyBoxes, containerRect);
  }

  _collectPartyBoxes(elections, columnElements) {
    const boxes = {};
    columnElements.forEach((col, colIdx) => {
      if (!elections[colIdx]) return;
      const key = elections[colIdx].key;
      const cards = col.getPartyCardElements();
      elections[colIdx].parties.forEach((party, pIdx) => {
        if (party && party.id && cards[pIdx]) {
          boxes[`${key}-${party.id}`] = cards[pIdx];
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

  /** The one place a line is built: solid for a succession, dashed for a defection. */
  _drawLine(from, to, dashed) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('stroke', '#333');
    line.setAttribute('stroke-width', '2');
    if (dashed) line.setAttribute('stroke-dasharray', '6,4');
    this._svg.appendChild(line);
  }

  /** A wide transparent line on top of a real one, to show `description` on hover. */
  _drawHitLine(from, to, description) {
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

  _drawNodes(graph, columnElements, partyBoxes, containerRect) {
    const colIndex = key => graph.elections.findIndex(e => e.key === key);

    graph.nodes.forEach(node => {
      const prevCol = columnElements[colIndex(node.prevKey)];
      const nextCol = columnElements[colIndex(node.nextKey)];
      if (!prevCol || !nextCol) return;

      const prevRect = prevCol.getBoundingClientRect();
      const nextRect = nextCol.getBoundingClientRect();
      const x = ((prevRect.right + nextRect.left) / 2) - containerRect.left;

      const centre = leg => {
        const box = partyBoxes[`${leg.key}-${leg.id}`];
        return box ? this._getBoxCenter(box, containerRect) : null;
      };
      const sources = node.sources.map(leg => ({ leg, pos: centre(leg) })).filter(s => s.pos);
      const targets = node.targets.map(leg => ({ leg, pos: centre(leg) })).filter(t => t.pos);

      const ys = [...sources, ...targets].map(l => l.pos.y);
      const y = ys.length > 0
        ? ys.reduce((a, b) => a + b, 0) / ys.length
        : ((prevRect.top + nextRect.top + prevRect.bottom + nextRect.bottom) / 4) - containerRect.top;

      const r = 18;
      const here = { x, y };

      sources.forEach(({ leg, pos }) => this._drawLine(pos, here, leg.kind === 'defection'));
      targets.forEach(({ leg, pos }) => this._drawLine(here, pos, leg.kind === 'defection'));

      // Node circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', '#d22');
      circle.setAttribute('stroke', '#333');
      circle.setAttribute('stroke-width', '2');
      this._svg.appendChild(circle);

      // Node label
      if (node.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + 30);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '14px');
        text.textContent = node.label;
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
