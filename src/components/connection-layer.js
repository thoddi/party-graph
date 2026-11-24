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
    .line {
      fill: none;
      stroke: var(--line-color, #333);
      stroke-width: 2;
      stroke-linejoin: round;
      transition: opacity 0.15s;
    }
    .node {
      fill: #d22;
      stroke: var(--line-color, #333);
      stroke-width: 2;
      transition: opacity 0.15s;
    }
    .node-label { transition: opacity 0.15s; }
    .dim { opacity: 0.12; }
    .hl.line { stroke-width: 3.5; }
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
    this._edgeEls = [];   // the line of each edge, by index in graph.edges
    this._nodeEls = [];   // per group node: its circle, label and lines
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
   * @param {Object} [layout] - The layout from layoutGraph(); gives the path of lines that skip columns
   */
  draw(graph, columnElements, container, layout) {
    this._svg.innerHTML = '';
    this._edgeEls = [];
    this._nodeEls = [];
    if (!graph || !columnElements || !container) return;

    const containerRect = container.getBoundingClientRect();
    const width = container.scrollWidth;
    const height = container.scrollHeight;

    this._svg.setAttribute('width', width);
    this._svg.setAttribute('height', height);
    this.style.width = width + 'px';
    this.style.height = height + 'px';

    const partyBoxes = this._collectPartyBoxes(graph.elections, columnElements);

    graph.edges.forEach((edge, i) => {
      const fromBox = partyBoxes[`${edge.fromKey}-${edge.fromId}`];
      const toBox = partyBoxes[`${edge.toKey}-${edge.toId}`];
      if (!fromBox || !toBox) return;
      // a line that skips columns bends through the rows reserved for it (see services/layout.js)
      const via = (layout?.edgePaths[i] ?? []).map(({ col, row }) => {
        const column = columnElements[col];
        const rect = column.getBoundingClientRect();
        return { x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top + column.rowCenterY(row) };
      });
      const path = [this._getBoxCenter(fromBox, containerRect), ...via, this._getBoxCenter(toBox, containerRect)];
      this._edgeEls[i] = this._drawPath(path, edge.kind === 'defection');
      if (edge.description) this._drawHitPath(path, edge.description);
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
  _drawPath(points, dashed) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    line.classList.add('line');
    if (dashed) line.setAttribute('stroke-dasharray', '6,4');
    this._svg.appendChild(line);
    return line;
  }

  _drawLine(from, to, dashed) {
    return this._drawPath([from, to], dashed);
  }

  /** A wide transparent line on top of a real one, to show `description` on hover. */
  _drawHitPath(points, description) {
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    hit.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '16');
    hit.setAttribute('pointer-events', 'stroke');
    hit.classList.add('hit-line');
    hit.addEventListener('mousemove', evt => this._showPopover(description, evt));
    hit.addEventListener('mouseleave', () => this._hidePopover());
    this._svg.appendChild(hit);
  }

  _drawNodes(graph, columnElements, partyBoxes, containerRect) {
    const colIndex = key => graph.elections.findIndex(e => e.key === key);

    graph.nodes.forEach((node, nodeIndex) => {
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

      const entry = { sources: {}, targets: {}, circle: null, label: null };
      sources.forEach(({ leg, pos }) => { entry.sources[node.sources.indexOf(leg)] = this._drawLine(pos, here, leg.kind === 'defection'); });
      targets.forEach(({ leg, pos }) => { entry.targets[node.targets.indexOf(leg)] = this._drawLine(here, pos, leg.kind === 'defection'); });
      this._nodeEls[nodeIndex] = entry;

      // Node circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', r);
      circle.classList.add('node');
      this._svg.appendChild(circle);
      entry.circle = circle;

      // Node label
      if (node.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + 30);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '14px');
        text.textContent = node.label;
        text.classList.add('node-label');
        this._svg.appendChild(text);
        entry.label = text;
      }
    });
  }

  /**
   * Highlight what selectionFor() (services/graph-model.js) picked and dim the rest, or with
   * null clear it. Only CSS classes change, so nothing is redrawn.
   */
  highlight(selection) {
    const all = [...this._edgeEls, ...this._nodeEls.flatMap(n => n ? [...Object.values(n.sources), ...Object.values(n.targets), n.circle, n.label] : [])];
    for (const el of all) el?.classList.remove('dim', 'hl');
    if (!selection) return;
    for (const el of all) el?.classList.add('dim');
    const on = el => el?.classList.remove('dim'), mark = el => { on(el); el?.classList.add('hl'); };
    selection.edges.forEach(i => mark(this._edgeEls[i]));
    for (const { index, sources, targets } of selection.nodes) {
      const entry = this._nodeEls[index];
      if (!entry) continue;
      on(entry.circle); on(entry.label);
      sources.forEach(j => mark(entry.sources[j]));
      targets.forEach(j => mark(entry.targets[j]));
    }
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
