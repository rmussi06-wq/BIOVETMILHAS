import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCW2HG6ECzk6OD0cenYqY1R3rsJ1Oecgek",
  authDomain:        "biovet-parceiro-vet.firebaseapp.com",
  projectId:         "biovet-parceiro-vet",
  storageBucket:     "biovet-parceiro-vet.firebasestorage.app",
  messagingSenderId: "549792200166",
  appId:             "1:549792200166:web:0cf14a3895227b79031227"
};

const GEMINI_API_KEY = 'AIzaSyBPuz3oZB-R0mtOIW7xRXNa9h53WOrCy14';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ── FIREBASE ──────────────────────────────────────────────────────────────────
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// ── ESTADO ────────────────────────────────────────────────────────────────────
let _userData         = null;    // dados do usuário logado
let _medAtual         = null;    // medicamento em edição/leitura { id, ...data }
let _principios       = [];      // tags de princípios ativos (escritor)
let _especies         = [];      // tags de espécies (escritor)
let _referencias      = [];      // referências bibliográficas (escritor)
let _posologiaLinhas  = [];      // linhas da tabela de posologia (escritor)
let _iaSecaoId        = null;    // id da seção sendo melhorada pela IA
let _iaSugestao       = '';      // texto sugerido pela IA
let _searchDebounce   = null;
let _todosPublicados  = [];      // cache da busca de leitura
let _rctMedId         = '';      // id do medicamento do receituário aberto

// ── HELPERS ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mostrarMsg(el, txt, tipo = 'error') {
  if (!el) return;
  el.textContent  = txt;
  el.className    = `guia-msg guia-msg--${tipo}`;
  el.style.display = 'block';
  if (tipo !== 'error') setTimeout(() => { el.style.display = 'none'; }, 4000);
}
function ocultarMsg(el) { if (el) el.style.display = 'none'; }

function formatarData(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── VIEWS ─────────────────────────────────────────────────────────────────────
function ocultarTudo() {
  document.getElementById('guia-loading').style.display  = 'none';
  document.querySelectorAll('.guia-view').forEach(v => v.classList.remove('active'));
}

function mostrarViewEscritor(user, data) {
  ocultarTudo();
  document.getElementById('escritor-nome-user').textContent = data.nome || user.email;
  document.getElementById('view-escritor').classList.add('active');
  carregarListaMeds();
}

function mostrarViewLeitura(user, data) {
  ocultarTudo();
  document.getElementById('leitura-nome-user').textContent = data.nome || user.email;
  document.getElementById('view-leitura').classList.add('active');
  carregarTodosPublicados();
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('/');
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) { await signOut(auth); window.location.replace('/'); return; }

    const data = snap.data();
    const role = (data.role || '').trim();
    _userData  = { uid: user.uid, email: user.email, ...data };

    if (role === 'escritor') {
      mostrarViewEscritor(user, data);
    } else if (role === 'vet' || role === 'vet2') {
      mostrarViewLeitura(user, data);
    } else {
      await signOut(auth);
      window.location.replace('/');
    }
  } catch (err) {
    console.error(err);
    await signOut(auth);
    window.location.replace('/');
  }
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('escritor-logout-btn')?.addEventListener('click', () => signOut(auth).then(() => window.location.replace('/')));
document.getElementById('leitura-logout-btn')?.addEventListener('click',  () => signOut(auth).then(() => window.location.replace('/')));

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO ESCRITOR
// ══════════════════════════════════════════════════════════════════════════════

// ── CARREGAR LISTA ────────────────────────────────────────────────────────────
async function carregarListaMeds(filtro = '') {
  const listaEl = document.getElementById('escritor-lista-meds');
  if (!listaEl) return;

  listaEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.85rem">Carregando...</div>';

  try {
    const q     = query(collection(db, 'livro', 'medicamentos'), orderBy('nomeComercial'));
    const snap  = await getDocs(q);
    const meds  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const lower = filtro.toLowerCase();
    const filtrados = filtro
      ? meds.filter(m => m.nomeComercial?.toLowerCase().includes(lower) ||
                         m.principiosAtivos?.some(p => p.toLowerCase().includes(lower)))
      : meds;

    if (!filtrados.length) {
      listaEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.85rem;text-align:center">Nenhum medicamento</div>';
      return;
    }

    listaEl.innerHTML = filtrados.map(m => `
      <div class="med-item${_medAtual?.id === m.id ? ' active' : ''}"
           onclick="window.selecionarMed('${esc(m.id)}')">
        <div class="med-item__nome">${esc(m.nomeComercial)}</div>
        <div class="med-item__sub">
          ${esc((m.principiosAtivos || []).join(', ').substring(0, 50))}
          <span class="status-badge status-badge--${esc(m.status || 'rascunho')}" style="margin-left:6px">${esc(m.status || 'rascunho')}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    listaEl.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:0.85rem">Erro ao carregar</div>';
  }
}

// ── FILTRO SIDEBAR ────────────────────────────────────────────────────────────
document.getElementById('escritor-search-input')?.addEventListener('input', (e) => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => carregarListaMeds(e.target.value), 300);
});

// ── NOVO MED ──────────────────────────────────────────────────────────────────
document.getElementById('btn-novo-med')?.addEventListener('click', () => {
  _medAtual = null;
  _principios = []; _especies = []; _referencias = []; _posologiaLinhas = [];
  document.getElementById('escritor-placeholder').style.display = 'none';
  document.getElementById('escritor-form').style.display = 'block';
  document.getElementById('escritor-toolbar-nome').textContent = 'Novo Medicamento';

  ['ed-nome-comercial','ed-fabricante','ed-sobre','ed-indicacoes',
   'ed-contraindicacoes','ed-posologia-obs','ed-interacoes',
   'ed-mecanismo','ed-farmacocinetica'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('ed-classificacao').value = '';
  document.getElementById('ed-pdf-ref').value = '';

  renderizarTags('ed-principios-wrap', _principios, 'ed-principios-input');
  renderizarTags('ed-especies-wrap',   _especies,   'ed-especies-input');
  renderizarReferencias();
  renderizarPosologia();
  ocultarMsg(document.getElementById('escritor-msg'));

  document.querySelectorAll('.med-item').forEach(el => el.classList.remove('active'));
});

// ── SELECIONAR MED (EDITAR) ───────────────────────────────────────────────────
window.selecionarMed = async function(id) {
  try {
    const snap = await getDoc(doc(db, 'livro', 'medicamentos', id));
    if (!snap.exists()) return;
    const data = snap.data();
    _medAtual = { id, ...data };

    _principios      = [...(data.principiosAtivos || [])];
    _especies        = [...(data.especies || [])];
    _referencias     = [...(data.referencias || [])];
    _posologiaLinhas = (data.posologiaTabela || []).map(l => ({ ...l }));

    document.getElementById('escritor-placeholder').style.display = 'none';
    document.getElementById('escritor-form').style.display = 'block';
    document.getElementById('escritor-toolbar-nome').textContent = data.nomeComercial || 'Medicamento';

    document.getElementById('ed-nome-comercial').value    = data.nomeComercial      || '';
    document.getElementById('ed-fabricante').value        = data.fabricante         || '';
    document.getElementById('ed-classificacao').value     = data.classificacao      || '';
    document.getElementById('ed-sobre').value             = data.sobre              || '';
    document.getElementById('ed-indicacoes').value        = data.indicacoes         || '';
    document.getElementById('ed-contraindicacoes').value  = data.contraindicacoes   || '';
    document.getElementById('ed-posologia-obs').value     = data.posologiaObs       || '';
    document.getElementById('ed-interacoes').value        = data.interacoes         || '';
    document.getElementById('ed-mecanismo').value         = data.mecanismoAcao      || '';
    document.getElementById('ed-farmacocinetica').value   = data.farmacocinetica    || '';

    renderizarTags('ed-principios-wrap', _principios, 'ed-principios-input');
    renderizarTags('ed-especies-wrap',   _especies,   'ed-especies-input');
    renderizarReferencias();
    renderizarPosologia();
    ocultarMsg(document.getElementById('escritor-msg'));

    document.querySelectorAll('.med-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`.med-item`).forEach(el => {
      if (el.getAttribute('onclick')?.includes(id)) el.classList.add('active');
    });
  } catch (err) { console.error(err); }
};

// ── TAGS (princípios / espécies) ──────────────────────────────────────────────
function renderizarTags(wrapId, arr, inputId) {
  const wrap  = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  if (!wrap || !input) return;

  const existingInput = wrap.querySelector('input');
  wrap.innerHTML = '';

  arr.forEach((t, i) => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `${esc(t)} <button class="tag__remove" type="button" data-i="${i}">×</button>`;
    tag.querySelector('.tag__remove').addEventListener('click', () => {
      arr.splice(i, 1);
      renderizarTags(wrapId, arr, inputId);
    });
    wrap.appendChild(tag);
  });

  const inp = existingInput || document.createElement('input');
  inp.className   = 'tags-input';
  inp.id          = inputId;
  inp.placeholder = arr.length ? '' : input.placeholder;
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = inp.value.trim().replace(/,$/, '');
      if (val && !arr.includes(val)) {
        arr.push(val);
        renderizarTags(wrapId, arr, inputId);
      }
    }
  });
  wrap.appendChild(inp);
}

// ── POSOLOGIA TABELA ──────────────────────────────────────────────────────────
window.adicionarLinhaPosologia = function() {
  _posologiaLinhas.push({ especie:'', doseMin:'', doseMax:'', unidade:'mg/kg', via:'', intervalo:'', duracao:'' });
  renderizarPosologia();
};

function renderizarPosologia() {
  const tbody = document.getElementById('posologia-tbody');
  if (!tbody) return;

  tbody.innerHTML = _posologiaLinhas.map((l, i) => `
    <tr>
      ${['especie','doseMin','doseMax','unidade','via','intervalo','duracao'].map(f => `
        <td><input value="${esc(l[f])}" onchange="window._posologiaLinhas[${i}]['${f}']=this.value"></td>
      `).join('')}
      <td><button class="btn-remove-row" onclick="window.removerLinhaPosologia(${i})">✕</button></td>
    </tr>
  `).join('');
}
window._posologiaLinhas = _posologiaLinhas;

window.removerLinhaPosologia = function(i) {
  _posologiaLinhas.splice(i, 1);
  renderizarPosologia();
};

// ── REFERÊNCIAS ───────────────────────────────────────────────────────────────
window.adicionarReferencia = function() {
  _referencias.push('');
  renderizarReferencias();
};

function renderizarReferencias() {
  const lista = document.getElementById('referencias-list');
  if (!lista) return;

  lista.innerHTML = _referencias.map((r, i) => `
    <div class="referencia-item">
      <input type="text" value="${esc(r)}" placeholder="Ex: Plumb's Veterinary Drug Handbook, 10ª ed."
             onchange="window._referencias[${i}]=this.value">
      <button class="btn-secondary btn-sm" type="button" onclick="window.removerReferencia(${i})">✕</button>
    </div>
  `).join('');
}
window._referencias = _referencias;

window.removerReferencia = function(i) {
  _referencias.splice(i, 1);
  renderizarReferencias();
};

// ── COLETAR DADOS DO FORMULÁRIO ────────────────────────────────────────────────
function coletarFormulario() {
  return {
    nomeComercial:    document.getElementById('ed-nome-comercial').value.trim(),
    fabricante:       document.getElementById('ed-fabricante').value.trim(),
    classificacao:    document.getElementById('ed-classificacao').value,
    principiosAtivos: [..._principios],
    especies:         [..._especies],
    sobre:            document.getElementById('ed-sobre').value.trim(),
    indicacoes:       document.getElementById('ed-indicacoes').value.trim(),
    contraindicacoes: document.getElementById('ed-contraindicacoes').value.trim(),
    posologiaTabela:  _posologiaLinhas.map(l => ({ ...l })),
    posologiaObs:     document.getElementById('ed-posologia-obs').value.trim(),
    interacoes:       document.getElementById('ed-interacoes').value.trim(),
    mecanismoAcao:    document.getElementById('ed-mecanismo').value.trim(),
    farmacocinetica:  document.getElementById('ed-farmacocinetica').value.trim(),
    referencias:      [..._referencias].filter(Boolean),
    criadoPor:        _userData?.uid || '',
    atualizadoEm:     serverTimestamp()
  };
}

// ── SALVAR / PUBLICAR ─────────────────────────────────────────────────────────
async function salvarMed(status) {
  const msgEl = document.getElementById('escritor-msg');
  const dados = coletarFormulario();

  if (!dados.nomeComercial) {
    mostrarMsg(msgEl, 'O campo "Nome Comercial" é obrigatório.', 'error');
    return;
  }

  dados.status = status;
  const btnSalvar   = document.getElementById('btn-salvar-rascunho');
  const btnPublicar = document.getElementById('btn-publicar');
  btnSalvar.disabled = btnPublicar.disabled = true;

  try {
    if (_medAtual?.id) {
      await updateDoc(doc(db, 'livro', 'medicamentos', _medAtual.id), dados);
      _medAtual = { ..._medAtual, ...dados };
    } else {
      dados.criadoEm = serverTimestamp();
      const ref = await addDoc(collection(db, 'livro', 'medicamentos'), dados);
      _medAtual  = { id: ref.id, ...dados };
    }

    mostrarMsg(msgEl, status === 'publicado' ? '🚀 Publicado com sucesso!' : '💾 Rascunho salvo!', 'success');
    document.getElementById('escritor-toolbar-nome').textContent = dados.nomeComercial;
    await carregarListaMeds(document.getElementById('escritor-search-input')?.value || '');
  } catch (err) {
    console.error(err);
    mostrarMsg(msgEl, 'Erro ao salvar. Tente novamente.', 'error');
  } finally {
    btnSalvar.disabled = btnPublicar.disabled = false;
  }
}

document.getElementById('btn-salvar-rascunho')?.addEventListener('click', () => salvarMed('rascunho'));
document.getElementById('btn-publicar')?.addEventListener('click',         () => salvarMed('publicado'));

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO LEITURA
// ══════════════════════════════════════════════════════════════════════════════

// ── CARREGAR TODOS OS PUBLICADOS ──────────────────────────────────────────────
async function carregarTodosPublicados() {
  try {
    const q    = query(
      collection(db, 'livro', 'medicamentos'),
      where('status', '==', 'publicado')
    );
    const snap = await getDocs(q);
    _todosPublicados = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nomeComercial || '').localeCompare(b.nomeComercial || '', 'pt-BR'));
    renderizarSidebarLeitura(_todosPublicados);
  } catch (err) {
    console.error(err);
  }
}

function renderizarSidebarLeitura(meds) {
  const listaEl = document.getElementById('leitura-lista-meds');
  if (!listaEl) return;

  if (!meds.length) {
    listaEl.innerHTML = '<div class="sidebar-empty">Nenhum medicamento encontrado</div>';
    return;
  }

  listaEl.innerHTML = meds.map(m => `
    <div class="leitura-med-card${_medAtual?.id === m.id ? ' active' : ''}"
         onclick="window.abrirFichaLeitura('${esc(m.id)}')">
      <div class="leitura-med-card__nome">${esc(m.nomeComercial)}</div>
      <div class="leitura-med-card__ativo">${esc((m.principiosAtivos || []).join(' / '))}</div>
      <div class="leitura-med-card__badges">
        ${(m.especies || []).map(e => `<span class="badge-especie">${esc(e)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// ── BUSCA LEITURA ─────────────────────────────────────────────────────────────
document.getElementById('leitura-search-input')?.addEventListener('input', (e) => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    const termo  = e.target.value.trim().toLowerCase();
    if (!termo) { renderizarSidebarLeitura(_todosPublicados); return; }

    const filtrados = _todosPublicados.filter(m =>
      m.nomeComercial?.toLowerCase().includes(termo) ||
      (m.principiosAtivos || []).some(p => p.toLowerCase().includes(termo)) ||
      (m.fabricante || '').toLowerCase().includes(termo)
    );
    renderizarSidebarLeitura(filtrados);
  }, 300);
});

// ── ABRIR FICHA LEITURA ────────────────────────────────────────────────────────
window.abrirFichaLeitura = async function(id) {
  const m = _todosPublicados.find(x => x.id === id);
  if (!m) return;
  _medAtual = m;
  _rctMedId = id;

  document.querySelectorAll('.leitura-med-card').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.leitura-med-card').forEach(el => {
    if (el.getAttribute('onclick')?.includes(id)) el.classList.add('active');
  });

  document.getElementById('leitura-placeholder').style.display = 'none';

  const fichaEl = document.getElementById('leitura-ficha');
  fichaEl.style.display = 'block';
  fichaEl.innerHTML = renderizarFicha(m);

  inicializarAbas();
  inicializarCalculadora(m);
};

function renderizarFicha(m) {
  const principios = (m.principiosAtivos || []).join(' / ');
  const especies   = (m.especies || []).map(e => `<span class="badge-especie">${esc(e)}</span>`).join('');

  const posologiaHTML = (m.posologiaTabela || []).length
    ? `<div class="posologia-table-wrap"><table class="posologia-view-table">
        <thead><tr>
          <th>Espécie</th><th>Dose Mín</th><th>Dose Máx</th><th>Unidade</th><th>Via</th><th>Intervalo</th><th>Duração</th>
        </tr></thead>
        <tbody>
          ${(m.posologiaTabela).map(l => `
            <tr>
              <td>${esc(l.especie)}</td><td>${esc(l.doseMin)}</td><td>${esc(l.doseMax)}</td>
              <td>${esc(l.unidade)}</td><td>${esc(l.via)}</td><td>${esc(l.intervalo)}</td><td>${esc(l.duracao)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`
    : '<p style="color:var(--text-muted);font-size:0.88rem">Dados de posologia não disponíveis.</p>';

  return `
    <div class="ficha-header">
      <div class="ficha-header__nome">${esc(m.nomeComercial)}</div>
      <div class="ficha-header__fabricante">por ${esc(m.fabricante || '—')}</div>
      <div class="ficha-header__meta">
        ${m.classificacao ? `<span class="status-badge" style="background:var(--surface-alt);color:var(--teal-dark)">${esc(m.classificacao)}</span>` : ''}
        ${especies}
      </div>
    </div>

    <div class="ficha-tabs">
      <button class="ficha-tab active" data-tab="tab-sobre">Sobre</button>
      <button class="ficha-tab" data-tab="tab-indicacoes">Indicações</button>
      <button class="ficha-tab" data-tab="tab-doses">Doses</button>
      <button class="ficha-tab" data-tab="tab-interacoes">Interações</button>
      <button class="ficha-tab" data-tab="tab-farmacologia">Farmacologia</button>
    </div>

    <div id="tab-sobre" class="ficha-tab-panel active">
      <div class="ficha-content">${esc(m.sobre || 'Informação não disponível.')}</div>
      ${principios ? `<p style="margin-top:12px;font-size:0.82rem;color:var(--text-soft)"><strong>Princípios ativos:</strong> ${esc(principios)}</p>` : ''}
    </div>
    <div id="tab-indicacoes" class="ficha-tab-panel">
      ${m.indicacoes ? `<h4 style="margin-bottom:8px;color:var(--teal-dark)">Indicações</h4><div class="ficha-content">${esc(m.indicacoes)}</div>` : ''}
      ${m.contraindicacoes ? `<h4 style="margin:16px 0 8px;color:var(--teal-dark)">Contraindicações</h4><div class="ficha-content">${esc(m.contraindicacoes)}</div>` : ''}
      ${!m.indicacoes && !m.contraindicacoes ? '<p style="color:var(--text-muted)">Informação não disponível.</p>' : ''}
    </div>
    <div id="tab-doses" class="ficha-tab-panel">
      ${posologiaHTML}
      ${m.posologiaObs ? `<p style="margin-top:12px;font-size:0.88rem;color:var(--text-soft)">${esc(m.posologiaObs)}</p>` : ''}
    </div>
    <div id="tab-interacoes" class="ficha-tab-panel">
      <div class="ficha-content">${esc(m.interacoes || 'Informação não disponível.')}</div>
    </div>
    <div id="tab-farmacologia" class="ficha-tab-panel">
      ${m.mecanismoAcao ? `<h4 style="margin-bottom:8px;color:var(--teal-dark)">Mecanismo de Ação</h4><div class="ficha-content">${esc(m.mecanismoAcao)}</div>` : ''}
      ${m.farmacocinetica ? `<h4 style="margin:16px 0 8px;color:var(--teal-dark)">Farmacocinética</h4><div class="ficha-content">${esc(m.farmacocinetica)}</div>` : ''}
      ${!m.mecanismoAcao && !m.farmacocinetica ? '<p style="color:var(--text-muted)">Informação não disponível.</p>' : ''}
    </div>

    <div class="calculadora" id="ficha-calculadora">
      <div class="calculadora__title">🧮 Calculadora de Dose</div>
      <div class="calculadora__form">
        <div class="form-group">
          <label class="guia-label">Espécie</label>
          <select id="calc-especie" class="guia-select" onchange="window.calcular()">
            <option value="">Selecionar</option>
            ${(m.especies || []).map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="guia-label">Peso (kg)</label>
          <input type="number" id="calc-peso" class="guia-input" min="0.1" step="0.1"
                 placeholder="0.0" oninput="window.calcular()">
        </div>
        <div class="form-group">
          <label class="guia-label">Concentração (mg/ml)</label>
          <input type="number" id="calc-concentracao" class="guia-input" min="0" step="0.1"
                 placeholder="Opcional" oninput="window.calcular()">
        </div>
      </div>
      <div class="calculadora__result" id="calc-resultado">
        Preencha espécie e peso para calcular a dose.
      </div>
      <div style="margin-top:12px">
        <button class="btn-primary" type="button" onclick="window.abrirModalReceituario()">
          📄 Emitir Receituário
        </button>
      </div>
    </div>

    ${(m.referencias || []).length ? `
      <div class="ficha-section" style="margin-top:16px">
        <div class="ficha-section__title">Referências</div>
        <ol style="margin-left:18px;font-size:0.85rem;color:var(--text-soft);line-height:1.8">
          ${m.referencias.map(r => `<li>${esc(r)}</li>`).join('')}
        </ol>
      </div>` : ''}
  `;
}

// ── ABAS FICHA ────────────────────────────────────────────────────────────────
function inicializarAbas() {
  document.querySelectorAll('.ficha-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.ficha-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ficha-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId)?.classList.add('active');
    });
  });
}

// ── CALCULADORA ───────────────────────────────────────────────────────────────
function inicializarCalculadora(m) {
  window._medParaCalculo = m;
}

window.calcular = function() {
  const m            = window._medParaCalculo;
  const especieSel   = document.getElementById('calc-especie')?.value;
  const pesoStr      = document.getElementById('calc-peso')?.value;
  const concStr      = document.getElementById('calc-concentracao')?.value;
  const resultEl     = document.getElementById('calc-resultado');
  if (!resultEl) return;

  const peso         = parseFloat(pesoStr);
  const concentracao = concStr ? parseFloat(concStr) : null;

  if (!especieSel || !peso || peso <= 0) {
    resultEl.innerHTML = 'Preencha espécie e peso para calcular a dose.';
    return;
  }

  const linha = (m?.posologiaTabela || []).find(l =>
    l.especie?.toLowerCase() === especieSel.toLowerCase()
  );

  if (!linha || (!linha.doseMin && !linha.doseMax)) {
    resultEl.innerHTML = `<span style="color:var(--text-muted)">Dados de dose não disponíveis para ${esc(especieSel)}.</span>`;
    return;
  }

  const doseMin = parseFloat(linha.doseMin) || 0;
  const doseMax = parseFloat(linha.doseMax) || doseMin;
  const unidade = linha.unidade || 'mg/kg';

  const doseMinTotal = +(doseMin * peso).toFixed(2);
  const doseMaxTotal = +(doseMax * peso).toFixed(2);

  let html = `<strong>Dose: ${doseMinTotal}${doseMin !== doseMax ? ` – ${doseMaxTotal}` : ''} ${unidade.replace('/kg','')}</strong>`;
  html += `<span style="color:var(--text-soft);margin-left:8px">(${doseMin}${doseMin !== doseMax ? `–${doseMax}` : ''} ${unidade} × ${peso} kg)</span>`;

  if (concentracao && concentracao > 0) {
    const volMin = +(doseMinTotal / concentracao).toFixed(2);
    const volMax = +(doseMaxTotal / concentracao).toFixed(2);
    html += `<br><strong style="margin-top:4px;display:block">Volume: ${volMin}${volMin !== volMax ? ` – ${volMax}` : ''} ml</strong>`;
    html += `<span style="color:var(--text-soft);font-size:0.82rem">(concentração: ${concentracao} mg/ml)</span>`;
  }

  if (linha.via)       html += `<br><span style="color:var(--text-soft);font-size:0.82rem">Via: ${esc(linha.via)}</span>`;
  if (linha.intervalo) html += `&nbsp;&nbsp;<span style="color:var(--text-soft);font-size:0.82rem">Intervalo: ${esc(linha.intervalo)}</span>`;
  if (linha.duracao)   html += `&nbsp;&nbsp;<span style="color:var(--text-soft);font-size:0.82rem">Duração: ${esc(linha.duracao)}</span>`;

  resultEl.innerHTML = html;
};

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO RECEITUÁRIO
// ══════════════════════════════════════════════════════════════════════════════

// ── CANVAS ASSINATURA ─────────────────────────────────────────────────────────
let _assinaturaDesenhando = false;
let _assinaturaCtx        = null;

function inicializarCanvas() {
  const canvas = document.getElementById('canvas-assinatura');
  if (!canvas) return;
  _assinaturaCtx = canvas.getContext('2d');
  _assinaturaCtx.strokeStyle = '#1A3A3D';
  _assinaturaCtx.lineWidth   = 2;
  _assinaturaCtx.lineCap     = 'round';

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    const src    = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
  };

  const start = (e) => { e.preventDefault(); _assinaturaDesenhando = true; const p = pos(e); _assinaturaCtx.beginPath(); _assinaturaCtx.moveTo(p.x, p.y); };
  const draw  = (e) => { e.preventDefault(); if (!_assinaturaDesenhando) return; const p = pos(e); _assinaturaCtx.lineTo(p.x, p.y); _assinaturaCtx.stroke(); };
  const stop  = ()  => { _assinaturaDesenhando = false; };

  canvas.addEventListener('mousedown',  start);
  canvas.addEventListener('mousemove',  draw);
  canvas.addEventListener('mouseup',    stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove',  draw,  { passive: false });
  canvas.addEventListener('touchend',   stop);
}

window.limparAssinatura = function() {
  const canvas = document.getElementById('canvas-assinatura');
  if (canvas && _assinaturaCtx) _assinaturaCtx.clearRect(0, 0, canvas.width, canvas.height);
};

// ── ABRIR / FECHAR MODAL RECEITUÁRIO ──────────────────────────────────────────
window.abrirModalReceituario = function() {
  const m = _medAtual;
  if (!m) return;

  // Pré-preencher dados
  document.getElementById('rct-med-nome').value = m.nomeComercial || '';

  // Dose calculada do resultado da calculadora
  const calcEl = document.getElementById('calc-resultado');
  const doseTexto = calcEl?.querySelector('strong')?.textContent || '';
  document.getElementById('rct-dose-calculada').value = doseTexto;

  // Espécie selecionada na calculadora
  const especieSel = document.getElementById('calc-especie')?.value || '';
  document.getElementById('rct-paciente-especie').value = especieSel;

  // Limpar outros campos
  ['rct-paciente-nome','rct-paciente-raca','rct-tutor-nome',
   'rct-posologia','rct-via','rct-observacoes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('rct-paciente-peso').value = document.getElementById('calc-peso')?.value || '';

  ocultarMsg(document.getElementById('rct-msg'));
  document.getElementById('modal-receituario').classList.remove('hidden');

  // Inicializar canvas
  setTimeout(inicializarCanvas, 50);
};

window.fecharModalReceituario = function() {
  document.getElementById('modal-receituario').classList.add('hidden');
  window.limparAssinatura();
};

// ── CONFIRMAR RECEITUÁRIO ─────────────────────────────────────────────────────
window.confirmarReceituario = async function() {
  const msgEl = document.getElementById('rct-msg');
  const btn   = document.getElementById('btn-emitir-confirmar');

  const pacienteNome   = document.getElementById('rct-paciente-nome').value.trim();
  const pacienteEspecie= document.getElementById('rct-paciente-especie').value.trim();
  const pacientePeso   = parseFloat(document.getElementById('rct-paciente-peso').value) || 0;
  const tutorNome      = document.getElementById('rct-tutor-nome').value.trim();
  const posologia      = document.getElementById('rct-posologia').value.trim();
  const via            = document.getElementById('rct-via').value.trim();

  if (!pacienteNome || !pacienteEspecie || !pacientePeso || !tutorNome || !posologia || !via) {
    mostrarMsg(msgEl, 'Preencha todos os campos obrigatórios (*).', 'error');
    return;
  }

  const canvas = document.getElementById('canvas-assinatura');
  const assinaturaBase64 = canvas ? canvas.toDataURL('image/png') : '';

  const id     = crypto.randomUUID();
  const agora  = new Date();
  const conteudo = `${id}|${_userData?.nome}|${_userData?.crmv}|${pacienteNome}|${pacienteEspecie}|${tutorNome}|${posologia}|${via}|${agora.toISOString()}`;
  const hash   = await sha256(conteudo);

  const dados  = {
    id,
    hash,
    vetUid:           _userData?.uid       || '',
    vetNome:          _userData?.nome      || '',
    vetCrmv:          _userData?.crmv      || '',
    pacienteNome,
    pacienteEspecie,
    pacienteRaca:     document.getElementById('rct-paciente-raca').value.trim(),
    pacientePeso,
    tutorNome,
    medicamentoId:    _rctMedId,
    medicamentoNome:  document.getElementById('rct-med-nome').value.trim(),
    principioAtivo:   (_medAtual?.principiosAtivos || []).join(', '),
    doseCalculada:    document.getElementById('rct-dose-calculada').value.trim(),
    posologia,
    via,
    observacoes:      document.getElementById('rct-observacoes').value.trim(),
    assinaturaBase64,
    dataEmissao:      serverTimestamp(),
    criadoEm:         serverTimestamp()
  };

  btn.disabled = true;
  try {
    await setDoc(doc(db, 'receituarios', id), dados);
    window.fecharModalReceituario();
    await exibirReceituarioImprimivel({ ...dados, dataEmissao: agora });
  } catch (err) {
    console.error(err);
    mostrarMsg(msgEl, 'Erro ao emitir receituário. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
  }
};

// ── EXIBIR RECEITUÁRIO IMPRIMÍVEL ─────────────────────────────────────────────
async function exibirReceituarioImprimivel(r) {
  const verUrl = `https://app.biovetfarma.com.br/receituario/verificar.html?id=${r.id}`;
  const dataStr = r.dataEmissao instanceof Date
    ? r.dataEmissao.toLocaleDateString('pt-BR')
    : formatarData(r.dataEmissao);

  const container = document.getElementById('rct-print-content');
  container.innerHTML = `
    <div class="rct-header">
      <img src="/assets/logo-biovetfarma.png" alt="Biovetfarma">
      <div class="rct-header__title">
        <h1>RECEITUÁRIO VETERINÁRIO</h1>
        <p>Nº ${esc(r.id.substring(0,8).toUpperCase())} &nbsp;|&nbsp; Data: ${dataStr}</p>
      </div>
    </div>

    <div class="rct-section">
      <div class="rct-section__title">Médico Veterinário</div>
      <div class="rct-grid">
        <div><div class="rct-field__label">Nome</div><div class="rct-field__value">${esc(r.vetNome)}</div></div>
        <div><div class="rct-field__label">CRMV</div><div class="rct-field__value">${esc(r.vetCrmv)}</div></div>
      </div>
    </div>

    <div class="rct-section">
      <div class="rct-section__title">Paciente</div>
      <div class="rct-grid">
        <div><div class="rct-field__label">Nome</div><div class="rct-field__value">${esc(r.pacienteNome)}</div></div>
        <div><div class="rct-field__label">Espécie / Raça</div><div class="rct-field__value">${esc([r.pacienteEspecie, r.pacienteRaca].filter(Boolean).join(' / '))}</div></div>
        <div><div class="rct-field__label">Peso</div><div class="rct-field__value">${r.pacientePeso} kg</div></div>
        <div><div class="rct-field__label">Tutor / Proprietário</div><div class="rct-field__value">${esc(r.tutorNome)}</div></div>
      </div>
    </div>

    <div class="rct-section">
      <div class="rct-section__title">Prescrição</div>
      <div class="rct-prescricao-box">
        <p><strong>Medicamento:</strong> ${esc(r.medicamentoNome)}</p>
        ${r.principioAtivo ? `<p><strong>Princípio Ativo:</strong> ${esc(r.principioAtivo)}</p>` : ''}
        ${r.doseCalculada  ? `<p><strong>Dose:</strong> ${esc(r.doseCalculada)}</p>` : ''}
        <p><strong>Posologia:</strong> ${esc(r.posologia)}</p>
        <p><strong>Via:</strong> ${esc(r.via)}</p>
        ${r.observacoes ? `<p><strong>Observações:</strong> ${esc(r.observacoes)}</p>` : ''}
      </div>
    </div>

    <div class="rct-footer">
      <div class="rct-assinatura">
        ${r.assinaturaBase64 ? `<img src="${r.assinaturaBase64}" alt="Assinatura">` : '<div style="height:60px;border-bottom:1px solid #ccc;width:200px"></div>'}
        <p>${esc(r.vetNome)}</p>
        <p>CRMV ${esc(r.vetCrmv)}</p>
      </div>
      <div class="rct-qr" id="rct-qr-container">
        <p>Escaneie para verificar autenticidade</p>
      </div>
    </div>
  `;

  // Gerar QR Code
  const qrDiv = document.createElement('div');
  document.getElementById('rct-qr-container').prepend(qrDiv);
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrDiv, { text: verUrl, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.M });
  }

  document.getElementById('print-receituario-view').style.display = 'block';
  setTimeout(() => window.print(), 400);
  setTimeout(() => { document.getElementById('print-receituario-view').style.display = 'none'; }, 3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO IA
// ══════════════════════════════════════════════════════════════════════════════

const _secaoParaId = {
  'sobre':            'ed-sobre',
  'indicacoes':       'ed-indicacoes',
  'contraindicacoes': 'ed-contraindicacoes',
  'interacoes':       'ed-interacoes',
  'farmacologia':     'ed-mecanismo'
};

window.abrirIA = async function(secaoId, secaoNome) {
  if (!GEMINI_API_KEY) {
    alert('Chave da API Gemini não configurada. Preencha GEMINI_API_KEY em guia.js.');
    return;
  }

  _iaSecaoId = secaoId;
  const elId      = _secaoParaId[secaoId];
  const textoOrig = document.getElementById(elId)?.value?.trim() || '';

  document.getElementById('ia-secao-nome').textContent     = secaoNome;
  document.getElementById('ia-texto-original').textContent = textoOrig || '(campo vazio)';
  document.getElementById('ia-texto-sugestao').textContent = '';
  document.getElementById('ia-loading').style.display      = 'flex';
  document.getElementById('ia-comparacao').style.display   = 'none';
  document.getElementById('ia-msg').style.display          = 'none';
  document.getElementById('btn-ia-aceitar').disabled       = true;
  document.getElementById('modal-ia').classList.remove('hidden');

  try {
    let pdfPart = null;
    const pdfInput = document.getElementById('ed-pdf-ref');
    if (pdfInput?.files?.length) {
      const base64 = await lerArquivoBase64(pdfInput.files[0]);
      pdfPart = { inlineData: { mimeType: 'application/pdf', data: base64 } };
    }

    const prompt = `Você é um especialista em medicina veterinária e farmacologia veterinária.
Reescreva o texto abaixo com linguagem técnica precisa, adequada para um compêndio farmacológico veterinário profissional.
Baseie-se nas seguintes referências: Formulário Veterinário Brasileiro (3ª edição), MAPA - Compêndio de Produtos Veterinários, Plumb's Veterinary Drug Handbook (10ª edição), Ettinger's Textbook of Veterinary Internal Medicine.
Mantenha as informações factuais. Melhore clareza, precisão técnica e completude.
Responda apenas com o texto melhorado, sem explicações adicionais.

Seção: ${secaoNome}
Medicamento: ${document.getElementById('ed-nome-comercial')?.value || ''}
Texto original:
${textoOrig}`;

    const parts = [{ text: prompt }];
    if (pdfPart) parts.push(pdfPart);

    const res = await fetch(GEMINI_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts }] })
    });

    if (res.status === 429) throw new Error('__429__');
    if (!res.ok) throw new Error(`Gemini API: ${res.status}`);
    const json = await res.json();
    _iaSugestao = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!_iaSugestao) throw new Error('Resposta vazia da IA');

    document.getElementById('ia-texto-sugestao').textContent = _iaSugestao;
    document.getElementById('ia-loading').style.display    = 'none';
    document.getElementById('ia-comparacao').style.display = 'grid';
    document.getElementById('btn-ia-aceitar').disabled     = false;

  } catch (err) {
    console.error(err);
    document.getElementById('ia-loading').style.display = 'none';
    const msg = err.message === '__429__'
      ? 'Assistente temporariamente indisponível. Tente novamente em alguns minutos.'
      : `Erro ao consultar IA: ${err.message}`;
    mostrarMsg(document.getElementById('ia-msg'), msg, 'error');
  }
};

window.fecharModalIA = function() {
  document.getElementById('modal-ia').classList.add('hidden');
  _iaSecaoId  = null;
  _iaSugestao = '';
};

window.aceitarSugestaoIA = function() {
  if (!_iaSecaoId || !_iaSugestao) return;
  const elId = _secaoParaId[_iaSecaoId];
  const el   = document.getElementById(elId);
  if (el) el.value = _iaSugestao;
  window.fecharModalIA();
};

// ── BOTÃO PRINCIPAL "✨ MELHORAR COM IA" NA TOOLBAR ───────────────────────────
document.getElementById('btn-ia')?.addEventListener('click', () => {
  window.abrirIA('sobre', 'Sobre / Descrição Geral');
});

// ── LER ARQUIVO BASE64 ────────────────────────────────────────────────────────
function lerArquivoBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
