import PartyData from '../services/party-data.js';
import { normalizeElections } from '../services/election-data.js';
import { buildGraph, selectionFor, cardKey } from '../services/graph-model.js';
import { partyHistory } from '../services/party-history.js';
import { layoutGraph } from '../services/layout.js';
import { DATASETS, describeElections } from '../services/datasets.js';
import './election-column.js';
import './connection-layer.js';
import './party-group.js';
import './party-panel.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .header {
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: -0.01em;
    }
    .lede {
      margin: 0;
      max-width: 60ch;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.4;
    }
    .switcher {
      display: inline-flex;
      gap: 4px;
      margin: 0 0 24px;
      padding: 4px;
      max-width: 100%;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 14px;
    }
    .seg {
      appearance: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      padding: 8px 18px;
      font: inherit;
      color: var(--muted);
      text-align: left;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
    }
    .seg:hover { color: var(--fg); }
    .seg[aria-selected="true"] {
      color: var(--fg);
      background: var(--surface-3);
      border-color: var(--border);
      box-shadow: 0 1px 3px var(--shadow);
    }
    .seg:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    .seg-title { font-size: 16px; font-weight: 600; }
    .seg-sub { font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    @media (max-width: 700px) {
      h1 { font-size: 23px; }
      .switcher { display: flex; }
      .seg { flex: 1 1 0; padding: 8px 10px; }
      .seg-sub { font-size: 11px; }
    }
    .main-content {
      position: relative;
      min-height: 600px;
    }
    .main-content.panel-open { padding-right: 376px; }
    @media (max-width: 700px) {
      .main-content.panel-open { padding-right: 0; padding-bottom: 62vh; }
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

  <header class="header">
    <h1>Stjórnmálaflokkar á Íslandi</h1>
    <p class="lede">Fylgi flokka í kosningum og hvernig þeir hafa klofnað, sameinast og tekið við hver af öðrum.</p>
  </header>

  <div class="switcher" role="tablist" aria-label="Tegund kosninga">
    <button class="seg" type="button" role="tab" id="tab-althingi" aria-controls="main-content">
      <span class="seg-title">Alþingi</span><span class="seg-sub"></span>
    </button>
    <button class="seg" type="button" role="tab" id="tab-borgarstjorn" aria-controls="main-content">
      <span class="seg-title">Borgarstjórn</span><span class="seg-sub"></span>
    </button>
  </div>

  <div class="main-content" id="main-content" role="tabpanel">
    <connection-layer id="connections"></connection-layer>
    <div class="columns" id="columns"></div>
  </div>
  <party-panel id="panel"></party-panel>
`;

class ElectionGraph extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._columnsEl = this.shadowRoot.getElementById('columns');
    this._connectionLayer = this.shadowRoot.getElementById('connections');
    this._mainContent = this.shadowRoot.getElementById('main-content');
    this._panel = this.shadowRoot.getElementById('panel');

    this._currentType = 'althingi';
    this._electionData = { althingi: null, borgarstjorn: null };
    this._graphs = { althingi: null, borgarstjorn: null };
    this._layouts = { althingi: null, borgarstjorn: null };   // computed when a tab is first shown
    this._selected = null;   // party id kept by a click, tap or Enter
    this._hovered = null;    // party id under the mouse; only a preview
  }

  async connectedCallback() {
    await PartyData.load();
    this._savedLayouts = await this._loadSavedLayouts();
    await this._loadElectionData('althingi');
    await this._loadElectionData('borgarstjorn');

    this._applyHash();
    this._render();
    this._setupTabs();

    window.addEventListener('resize', () => this._drawConnections());
    this._setupSelection();
    this._setupPanel();
    window.addEventListener('hashchange', () => this._onHashChange());
    this._showPanel(false);
  }

  _setupPanel() {
    this._panel.addEventListener('panel-close', () => this._select(null, { restoreFocus: true }));
    this._panel.addEventListener('party-select', evt => this._goTo(evt.detail));
  }

  /** Open a party from the panel: on the current tab if it is there, else on the other one. */
  _goTo(partyId) {
    if (!selectionFor(this._graph, partyId)) {
      const other = Object.keys(this._graphs).find(t => t !== this._currentType && selectionFor(this._graphs[t], partyId));
      if (other) this._setTab(other);
    }
    this._select(partyId);
  }

  _showPanel(keyboard) {
    const open = !!this._selected;
    this._mainContent.classList.toggle('panel-open', open);
    if (!open) { this._panel.hide(); return; }
    const history = partyHistory(this._selected, PartyData.partiesById, this._electionData);
    if (history) this._panel.show(history, { focus: keyboard });
    else this._panel.hide();
  }

  // The address keeps the view: #althingi, or #borgarstjorn/framsokn for a party on a tab.
  _applyHash() {
    const [tab, party] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (this._graphs[tab]) this._currentType = tab;
    this._selected = party && PartyData.partiesById[party] ? party : null;
  }

  _writeHash() {
    const hash = '#' + this._currentType + (this._selected ? '/' + this._selected : '');
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  _onHashChange() {
    const before = [this._currentType, this._selected];
    this._applyHash();
    if (before[0] !== this._currentType) { this._syncTabs(); this._render(); }
    else this._applySelection();
    this._showPanel(false);
  }

  /**
   * Hover (mouse only) previews a party; click, tap or Enter/Space keeps it; Esc or a click
   * on empty space clears it. One listener on the columns finds the card from the event path.
   */
  _setupSelection() {
    const partyOf = evt => {
      const card = evt.composedPath().find(el => el.localName === 'party-card');
      return card && !card.hasAttribute('empty') ? card.getAttribute('party-id') : null;
    };
    const cols = this._columnsEl;
    cols.addEventListener('pointerover', evt => {
      if (evt.pointerType !== 'mouse') return;
      this._setHovered(partyOf(evt));
    });
    cols.addEventListener('pointerleave', () => this._setHovered(null));
    cols.addEventListener('focusin', evt => this._setHovered(partyOf(evt)));
    cols.addEventListener('focusout', () => this._setHovered(null));
    cols.addEventListener('click', evt => {
      const id = partyOf(evt);
      this._lastCard = evt.composedPath().find(el => el.localName === 'party-card');
      if (id) this._select(id === this._selected ? null : id);
    });
    cols.addEventListener('keydown', evt => {
      if (evt.key !== 'Enter' && evt.key !== ' ') return;
      const id = partyOf(evt);
      if (!id) return;
      evt.preventDefault();
      this._lastCard = evt.composedPath().find(el => el.localName === 'party-card');
      this._select(id === this._selected ? null : id, { keyboard: true });
    });
    // a click that is not on a card or a line clears the selection
    this._mainContent.addEventListener('click', evt => {
      if (!partyOf(evt)) this._select(null);
    });
    document.addEventListener('keydown', evt => {
      if (evt.key === 'Escape' && (this._selected || this._hovered)) { this._hovered = null; this._select(null, { restoreFocus: !!this._selected }); }
    });
  }

  _setHovered(partyId) {
    if (partyId === this._hovered) return;
    this._hovered = partyId;
    this._applySelection();
  }

  _select(partyId, { restoreFocus = false, keyboard = false } = {}) {
    const hadFocusInPanel = this._panel.hide();
    this._selected = partyId;
    this._applySelection();
    this._showPanel(keyboard || (partyId != null && hadFocusInPanel));   // keep focus in the panel
    this._writeHash();
    if (partyId == null && (restoreFocus || hadFocusInPanel)) this._focusCard(this._lastCard);
  }

  _focusCard(card) { card?.isConnected && card.focus(); }

  /** Mark the cards and lines of the hovered party, or else the kept one; dim everything else. */
  _applySelection() {
    const graph = this._graph;
    const selection = graph ? selectionFor(graph, this._hovered ?? this._selected) : null;
    this._connectionLayer.highlight(selection);
    const columns = this._columnsEl.querySelectorAll('election-column');
    columns.forEach(col => {
      for (const card of col.getPartyCardElements()) {
        if (card.hasAttribute('empty')) continue;
        const key = cardKey(col.electionKey, card.getAttribute('party-id'));
        const on = !!selection?.cards.has(key);
        card.toggleAttribute('highlighted', on);
        card.setAttribute('aria-pressed', String(this._selected != null && card.getAttribute('party-id') === this._selected));
        card.toggleAttribute('related', !!selection?.related.has(key));
        card.toggleAttribute('dimmed', !!selection && !on && !selection.related.has(key));
      }
    });
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
    this._applySelection();
  }

  _setTab(type) {
    this._currentType = type;
    // keep the selected party only if it is on this tab too
    if (this._selected && !selectionFor(this._graphs[type], this._selected)) this._selected = null;
    this._hovered = null;
    this._syncTabs();
    this._render();
    this._showPanel(false);
    this._writeHash();
  }

  _syncTabs() {
    for (const type of Object.keys(DATASETS)) {
      const tab = this.shadowRoot.getElementById(`tab-${type}`);
      const on = this._currentType === type;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;   // one tab stop; the arrow keys move between the tabs
    }
    this._mainContent.setAttribute('aria-labelledby', `tab-${this._currentType}`);
  }

  /** "1923–2021 · 33 kosningar" under each tab name, from the data. */
  _fillTabMeta() {
    for (const type of Object.keys(DATASETS)) {
      const sub = this.shadowRoot.querySelector(`#tab-${type} .seg-sub`);
      sub.textContent = describeElections(this._electionData[type]?.elections ?? []);
    }
  }

  _setupTabs() {
    this._fillTabMeta();
    this._syncTabs();
    const types = Object.keys(DATASETS);
    for (const type of types) {
      this.shadowRoot.getElementById(`tab-${type}`).addEventListener('click', () => this._setTab(type));
    }
    this.shadowRoot.querySelector('.switcher').addEventListener('keydown', evt => {
      const i = types.indexOf(this._currentType);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: types.length - 1 }[evt.key];
      if (next == null) return;
      evt.preventDefault();
      const type = types[(next + types.length) % types.length];
      this._setTab(type);
      this.shadowRoot.getElementById(`tab-${type}`).focus();
    });
  }
}

customElements.define('election-graph', ElectionGraph);
export default ElectionGraph;
