import PartyData from '../services/party-data.js';
import PartyOrderer from '../services/party-orderer.js';
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
    .optimize-btn {
      font-size: 16px;
      padding: 4px 12px;
      cursor: pointer;
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
    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      left: 0;
      top: 0;
      width: 100vw;
      height: 100vh;
      background: #0008;
      z-index: 2000;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal {
      background: #fff;
      border-radius: 10px;
      padding: 32px 24px;
      min-width: 340px;
      max-width: 90vw;
      max-height: 90vh;
      box-shadow: 0 8px 32px #0004;
      position: relative;
    }
    .modal-close {
      position: absolute;
      right: 12px;
      top: 12px;
      font-size: 20px;
      background: none;
      border: none;
      cursor: pointer;
    }
    .modal h2 { margin-top: 0; }
    .algo-options { margin-bottom: 16px; }
    .algo-options label { display: block; margin: 4px 0; }
    .modal-actions { margin-top: 16px; }
    .modal-actions button { margin-right: 8px; }
    .import-section { margin-top: 10px; }
    .import-section textarea { width: 100%; height: 60px; }
  </style>

  <div class="header">
    <h1>Election Parties Visualization</h1>
    <button class="optimize-btn" id="optimize-btn">Raða flokkum optimalt</button>
  </div>

  <div class="tabs">
    <button class="tab-btn active" id="tab-althingi">Alþingiskosningar</button>
    <button class="tab-btn" id="tab-borgarstjorn">Borgarstjórnarkosningar</button>
  </div>

  <div class="main-content" id="main-content">
    <connection-layer id="connections"></connection-layer>
    <div class="columns" id="columns"></div>
  </div>

  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <button class="modal-close" id="modal-close">×</button>
      <h2>Veldu reiknirit fyrir uppröðun</h2>
      <div class="algo-options">
        <label><input type="radio" name="algo" value="barycenter" checked> Barycenter/Median röðun</label>
        <label><input type="radio" name="algo" value="greedy"> Greedy röðun</label>
        <label><input type="radio" name="algo" value="custom"> Sérsniðið (ef til)</label>
      </div>
      <button id="run-optimize">Keyra útreikning</button>
      <div id="optimize-result" style="margin: 12px 0;"></div>
      <div class="modal-actions" id="modal-actions" style="display:none;">
        <button id="apply-order">Endurteikna með þessari röðun</button>
        <button id="download-order">Sækja röðun (JSON)</button>
        <div class="import-section">
          <label>Settu inn röðunarskrá (JSON):</label>
          <textarea id="import-json"></textarea>
          <button id="import-btn">Nota þessa röðun</button>
        </div>
      </div>
    </div>
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
    this._groups = [];
    this._partyOrder = null;
    this._lastOrder = null;
  }

  async connectedCallback() {
    await PartyData.load();
    await this._loadPartyOrder();

    const groupsObj = await this._loadJson('groups.json');
    this._groups = groupsObj.groups || [];

    await this._loadElectionData('althingi');
    await this._loadElectionData('borgarstjorn');

    if (this._partyOrder && this._electionData.althingi) {
      PartyOrderer.applyPartyOrder(this._electionData.althingi, this._partyOrder);
    }

    this._render();
    this._setupTabs();
    this._setupModal();

    window.addEventListener('resize', () => this._drawConnections());
  }

  async _loadJson(url) {
    const resp = await fetch(url);
    return resp.json();
  }

  async _loadPartyOrder() {
    try {
      const resp = await fetch('party_order.json');
      if (resp.ok) this._partyOrder = await resp.json();
    } catch { /* ignore */ }
  }

  async _loadElectionData(type) {
    const file = type === 'althingi' ? 'data.json' : 'borgarstjorn_data.json';
    const data = await this._loadJson(file);
    data.groups = this._groups;
    this._electionData[type] = data;
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

    data.elections.forEach(election => {
      const col = document.createElement('election-column');
      col.setAttribute('year', election.year);
      col.parties = election.parties;
      this._columnsEl.appendChild(col);
    });
  }

  _drawConnections() {
    const data = this._data;
    if (!data) return;
    const columns = Array.from(this._columnsEl.querySelectorAll('election-column'));
    this._connectionLayer.draw(data, columns, this._mainContent);
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

  _setupModal() {
    const overlay = this.shadowRoot.getElementById('modal-overlay');
    const closeBtn = this.shadowRoot.getElementById('modal-close');
    const optimizeBtn = this.shadowRoot.getElementById('optimize-btn');
    const runBtn = this.shadowRoot.getElementById('run-optimize');
    const resultDiv = this.shadowRoot.getElementById('optimize-result');
    const actionsDiv = this.shadowRoot.getElementById('modal-actions');
    const applyBtn = this.shadowRoot.getElementById('apply-order');
    const downloadBtn = this.shadowRoot.getElementById('download-order');
    const importBtn = this.shadowRoot.getElementById('import-btn');
    const importJson = this.shadowRoot.getElementById('import-json');

    optimizeBtn.addEventListener('click', () => {
      overlay.classList.add('open');
      resultDiv.innerHTML = '';
      actionsDiv.style.display = 'none';
    });

    closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    runBtn.addEventListener('click', () => {
      const algo = this.shadowRoot.querySelector('input[name="algo"]:checked').value;
      const data = this._data;
      let order;
      if (algo === 'barycenter') {
        order = PartyOrderer.computeBarycenterOrder(data);
      } else if (algo === 'greedy') {
        order = PartyOrderer.computeFutureAwareOrder(data);
      } else {
        order = PartyOrderer.computeBarycenterOrder(data);
      }
      this._lastOrder = order;
      resultDiv.innerHTML = '<b>Röðun reiknuð!</b>';
      actionsDiv.style.display = '';
    });

    applyBtn.addEventListener('click', () => {
      if (this._lastOrder) {
        PartyOrderer.applyPartyOrder(this._data, this._lastOrder);
        this._render();
        overlay.classList.remove('open');
      }
    });

    downloadBtn.addEventListener('click', () => {
      if (this._lastOrder) {
        const blob = new Blob([JSON.stringify(this._lastOrder, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'party_order.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      }
    });

    importBtn.addEventListener('click', () => {
      try {
        const order = JSON.parse(importJson.value);
        this._lastOrder = order;
        resultDiv.innerHTML = '<b>Röðun úr JSON skrá lesin!</b>';
        actionsDiv.style.display = '';
      } catch {
        resultDiv.innerHTML = '<span style="color:red">Villa í JSON!</span>';
      }
    });
  }
}

customElements.define('election-graph', ElectionGraph);
export default ElectionGraph;
