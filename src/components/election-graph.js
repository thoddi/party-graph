import PartyData from '../services/party-data.js';
import { normalizeElections } from '../services/election-data.js';
import { buildGraph } from '../services/graph-model.js';
import { layoutGraph } from '../services/layout.js';
import { DATASETS } from '../services/datasets.js';
import './election-column.js';
import './connection-layer.js';
import './party-group.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: sans-serif;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
    }
    .tabs {
      margin-bottom: 18px;
    }
    .tab-btn {
      font-size: 16px;
      padding: 4px 16px;
      border-radius: 8px 8px 0 0;
      border: 1px solid #ccc;
      border-bottom: none;
      cursor: pointer;
      background: #eee;
      font-weight: bold;
    }
    .tab-btn.active {
      background: #ffe066;
    }
    .main-content {
      position: relative;
      min-height: 600px;
    }
    .columns {
      display: flex;
      align-items: flex-start;
      position: relative;
      z-index: 1;
    }
    connection-layer {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 0;
    }
  </style>

  <div class="header">
    <h1>Election Parties Visualization</h1>
  </div>

  <div class="tabs">
    <button class="tab-btn active" id="tab-althingi">Alþingiskosningar</button>
    <button class="tab-btn" id="tab-borgarstjorn">Borgarstjórnarkosningar</button>
  </div>

  <div class="main-content" id="main-content">
    <connection-layer id="connections"></connection-layer>
    <div class="columns" id="columns"></div>
  </div>
`;

class ElectionGraph extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._columnsEl = this.shadowRoot.getElementById('columns');
    this._connectionLayer = this.shadowRoot.getElementById('connections');
    this._mainContent = this.shadowRoot.getElementById('main-content');

    this._currentType = 'althingi';
    this._electionData = { althingi: null, borgarstjorn: null };
    this._graphs = { althingi: null, borgarstjorn: null };
    this._layouts = { althingi: null, borgarstjorn: null };   // computed when a tab is first shown
  }

  async connectedCallback() {
    await PartyData.load();
    this._savedLayouts = await this._loadSavedLayouts();
    await this._loadElectionData('althingi');
    await this._loadElectionData('borgarstjorn');

    this._render();
    this._setupTabs();

    window.addEventListener('resize', () => this._drawConnections());
  }

  async _loadJson(url) {
    const resp = await fetch(url);
    return resp.json();
  }

  /** layout.json, the saved rows (see tools/layout.mjs); missing or broken is fine. */
  async _loadSavedLayouts() {
    try {
      const resp = await fetch('layout.json');
      return resp.ok ? await resp.json() : {};
    } catch {
      return {};
    }
  }

  async _loadElectionData(type) {
    const file = DATASETS[type];
    const data = await this._loadJson(file);
    this._electionData[type] = normalizeElections(data);
    this._graphs[type] = buildGraph(data, PartyData.partiesById, type);
    for (const warning of this._graphs[type].warnings) console.warn(`${file}: ${warning}`);
  }

  get _data() {
    return this._electionData[this._currentType];
  }

  _render() {
    this._renderColumns();
    requestAnimationFrame(() => this._drawConnections());
  }

  _renderColumns() {
    this._columnsEl.innerHTML = '';
    const data = this._data;
    if (!data) return;
    const layout = this._layout;

    data.elections.forEach((election, i) => {
      const col = document.createElement('election-column');
      col.setAttribute('year', election.year);
      col.setAttribute('label', election.label);
      col.setAttribute('election-key', election.key);
      col.parties = election.parties;
      col.setLayout(layout.rows[i], layout.rowCount);
      this._columnsEl.appendChild(col);
    });
  }

  get _graph() {
    return this._graphs[this._currentType];
  }

  /**
   * Where the cards go in the current tab. Every card that has a row in layout.json stays
   * there; what is missing (new parties or elections, and the rows long lines pass through)
   * is placed by the search in services/layout.js. Kept once known.
   */
  get _layout() {
    const type = this._currentType;
    if (!this._layouts[type]) {
      const saved = this._savedLayouts?.[type];
      const layout = layoutGraph(this._electionData[type], this._graphs[type], { pinned: saved });
      if (!saved) console.info(`${type}: no saved layout; run node tools/layout.mjs --redo`);
      const report = layout.report;
      if (report?.placed.length) console.info(`${type}: ${report.placed.length} cards have no saved row (run node tools/layout.mjs to save them)`);
      if (report?.clashes.length) console.warn(`${type}: two cards saved on the same row: ${report.clashes.map(c => `${c.id} (${c.key})`).join(', ')}`);
      this._layouts[type] = layout;
    }
    return this._layouts[type];
  }

  _drawConnections() {
    const graph = this._graph;
    if (!graph) return;
    const columns = Array.from(this._columnsEl.querySelectorAll('election-column'));
    this._connectionLayer.draw(graph, columns, this._mainContent, this._layout);
  }

  _setupTabs() {
    const tabAlthingi = this.shadowRoot.getElementById('tab-althingi');
    const tabBorgarstjorn = this.shadowRoot.getElementById('tab-borgarstjorn');

    const setTab = (type) => {
      this._currentType = type;
      tabAlthingi.classList.toggle('active', type === 'althingi');
      tabBorgarstjorn.classList.toggle('active', type === 'borgarstjorn');
      this._render();
    };

    tabAlthingi.addEventListener('click', () => setTab('althingi'));
    tabBorgarstjorn.addEventListener('click', () => setTab('borgarstjorn'));
  }
}

customElements.define('election-graph', ElectionGraph);
export default ElectionGraph;
