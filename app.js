import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  collection,
  query,
  orderBy,
  where,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCW2HG6ECzk6OD0cenYqY1R3rsJ1Oecgek",
  authDomain:        "biovet-parceiro-vet.firebaseapp.com",
  projectId:         "biovet-parceiro-vet",
  storageBucket:     "biovet-parceiro-vet.firebasestorage.app",
  messagingSenderId: "549792200166",
  appId:             "1:549792200166:web:0cf14a3895227b79031227"
};

// EmailJS — preencha para ativar notificações de novos cadastros por e-mail
// 1. Crie conta em https://www.emailjs.com/
// 2. Crie um serviço de e-mail e um template com variáveis: {{vet_name}}, {{vet_crmv}}, {{vet_email}}
// 3. Preencha as constantes abaixo com seus IDs
const EMAILJS_SERVICE_ID  = '';   // ex: 'service_abc123'
const EMAILJS_TEMPLATE_ID = '';   // ex: 'template_xyz456'
const EMAILJS_PUBLIC_KEY  = '';   // ex: 'user_AbCdEfGhIj...'
const NOTIFICATION_EMAIL  = '';   // e-mail que receberá os avisos

const WHATSAPP_NUMBER = '5514997132879';

// ── FIREBASE ──────────────────────────────────────────────────────────────────
const fbApp   = initializeApp(firebaseConfig);
const auth    = getAuth(fbApp);
const db      = getFirestore(fbApp);
const storage = getStorage(fbApp);

// ── ESTADO ───────────────────────────────────────────────────────────────────
let isRegistering      = false;
let adminAllUsers      = [];
let currentEditUid     = null;
let carouselImages     = [];
let carouselIndex      = 0;
let carouselTimer      = null;
let dashCotacao        = { pontosBase: 1000, valorReais: 15 };

// ── ELEMENTOS ─────────────────────────────────────────────────────────────────
const authView      = document.getElementById('auth-view');
const homeView      = document.getElementById('home-view');
const adminView     = document.getElementById('admin-view');
const dashboardView = document.getElementById('dashboard-view');

const welcomeScreen = document.getElementById('welcome-screen');
const formsPanel    = document.getElementById('forms-panel');

const loginForm              = document.getElementById('login-form');
const loginEmailInput        = document.getElementById('login-email');
const loginPasswordInput     = document.getElementById('login-password');
const loginError             = document.getElementById('login-error');

const registerForm                 = document.getElementById('register-form');
const registerNameInput            = document.getElementById('register-name');
const registerCpfInput             = document.getElementById('register-cpf');
const registerDobInput             = document.getElementById('register-dob');
const registerCrmvInput            = document.getElementById('register-crmv');
const registerEmailInput           = document.getElementById('register-email');
const registerPasswordInput        = document.getElementById('register-password');
const registerPasswordConfirmInput = document.getElementById('register-password-confirm');
const registerError                = document.getElementById('register-error');

const resetForm       = document.getElementById('reset-form');
const resetEmailInput = document.getElementById('reset-email');
const resetInfo       = document.getElementById('reset-info');

const logoutBtn      = document.getElementById('logout-btn');
const userNameSpan   = document.getElementById('user-name');
const pointsValueEl  = document.getElementById('points-value');
const whatsappLink   = document.getElementById('whatsapp-link');
const cardUserNameEl = document.getElementById('card-user-name');
const cardUserCrmvEl = document.getElementById('card-user-crmv');

// ── VIEWS ─────────────────────────────────────────────────────────────────────
function ocultarTodasViews() {
  [authView, homeView, adminView, dashboardView,
   document.getElementById('print-comprovante-view')].forEach(v => v?.classList.remove('active'));
}

function mostrarAuthView(opcoes) {
  opcoes = opcoes || {};
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  ocultarTodasViews();
  authView.classList.add('active');

  formsPanel.classList.add('hidden');
  welcomeScreen.style.display = '';

  loginEmailInput.value    = '';
  loginPasswordInput.value = '';
  limparMensagem(loginError);

  if (opcoes.form) {
    if (typeof _navAbrirForms === 'function') {
      _navAbrirForms(opcoes.form);
    } else {
      welcomeScreen.style.display = 'none';
      formsPanel.classList.remove('hidden');
      [loginForm, registerForm, resetForm].forEach(f => f?.classList.add('hidden'));
      document.getElementById(opcoes.form)?.classList.remove('hidden');
    }
    if (opcoes.elId && opcoes.mensagem) {
      mostrarMensagem(document.getElementById(opcoes.elId), opcoes.mensagem, opcoes.tipo || 'error');
    }
  }
  window.scrollTo(0, 0);
}

function mostrarHomeView() {
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  ocultarTodasViews();
  homeView.classList.add('active');
  window.scrollTo(0, 0);
}

function mostrarAdminView() {
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  ocultarTodasViews();
  adminView.classList.add('active');
  window.scrollTo(0, 0);
}

function mostrarDashboardView() {
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  ocultarTodasViews();
  dashboardView.classList.add('active');
  window.scrollTo(0, 0);
}

// ── AUTENTICAÇÃO ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (isRegistering) return;

  if (user) {
    if (window.showLoadingOverlay) window.showLoadingOverlay();
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      );
      const snap = await Promise.race([
        getDoc(doc(db, 'users', user.uid)),
        timeoutPromise
      ]);

      if (!snap.exists()) {
        await signOut(auth);
        mostrarAuthView({ form: 'login-form', elId: 'login-error', mensagem: 'Cadastro não encontrado.', tipo: 'error' });
        return;
      }

      const data = snap.data();
      const role  = (data.role || '').trim();

      if (role === 'admin') {
        await carregarAdmin();
        mostrarAdminView();
      } else if (role === 'dashboard') {
        await carregarDashboard();
        mostrarDashboardView();
      } else if (data.approved === true) {
        await carregarDadosHome(user, data);
        mostrarHomeView();
      } else {
        await signOut(auth);
        mostrarAuthView({
          form: 'login-form',
          elId: 'login-error',
          mensagem: 'Cadastro ainda não aprovado. Aguarde o contato da equipe Biovetfarma.',
          tipo: 'error'
        });
      }
    } catch (err) {
      console.error(err);
      await signOut(auth);
      const msg = err.message === 'timeout'
        ? 'Conexão lenta. Verifique sua internet e tente novamente.'
        : 'Erro ao validar cadastro. Tente novamente.';
      mostrarAuthView({ form: 'login-form', elId: 'login-error', mensagem: msg, tipo: 'error' });
    }
  } else {
    mostrarAuthView();
  }
});

// ── LOGIN ──────────────────────────────────────────────────────────────────────
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparMensagem(loginError);

  const email    = loginEmailInput.value.trim().toLowerCase();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    mostrarMensagem(loginError, 'Informe e-mail e senha.', 'error');
    return;
  }

  const btn = loginForm.querySelector('button[type="submit"]');
  iniciarLoading(btn);

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    mostrarMensagem(loginError, traduzErro(err.code), 'error');
    pararLoading(btn);
  }
});

// ── CADASTRO ──────────────────────────────────────────────────────────────────
registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparMensagem(registerError);

  const nome           = registerNameInput.value.trim();
  const cpf            = registerCpfInput.value.trim();
  const dataNascimento = registerDobInput.value;
  const crmv           = registerCrmvInput.value.trim();
  const email          = registerEmailInput.value.trim().toLowerCase();
  const senha          = registerPasswordInput.value;
  const senhaConf      = registerPasswordConfirmInput.value;

  if (!nome || !cpf || !dataNascimento || !crmv || !email || !senha || !senhaConf) {
    mostrarMensagem(registerError, 'Preencha todos os campos.', 'error');
    return;
  }

  if (senha !== senhaConf) {
    mostrarMensagem(registerError, 'As senhas não conferem.', 'error');
    return;
  }

  const btn = registerForm.querySelector('button[type="submit"]');
  iniciarLoading(btn);

  try {
    isRegistering = true;

    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    await updateProfile(cred.user, { displayName: nome });

    await setDoc(doc(db, 'users', cred.user.uid), {
      nome, cpf, dataNascimento, crmv, email,
      pontos: 0,
      approved: false,
      role: 'vet',
      criadoEm: new Date().toISOString()
    });

    // Notificação por e-mail via EmailJS
    if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
      window.emailjs?.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email:  NOTIFICATION_EMAIL,
        vet_name:  nome,
        vet_crmv:  crmv,
        vet_email: email,
      }, EMAILJS_PUBLIC_KEY).catch(err => console.error('EmailJS:', err));
    }

    await new Promise(r => setTimeout(r, 400));
    await signOut(auth);
    registerForm.reset();

    mostrarAuthView({
      form: 'login-form',
      elId: 'login-error',
      mensagem: 'Cadastro realizado! Aguarde aprovação para acessar.',
      tipo: 'success'
    });

  } catch (err) {
    console.error(err);
    mostrarMensagem(registerError, traduzErro(err.code), 'error');
  } finally {
    isRegistering = false;
    pararLoading(btn);
  }
});

// ── RESET DE SENHA ────────────────────────────────────────────────────────────
resetForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparMensagem(resetInfo);

  const email = resetEmailInput.value.trim();
  if (!email) {
    mostrarMensagem(resetInfo, 'Informe o e-mail cadastrado.', 'error');
    return;
  }

  const btn = resetForm.querySelector('button[type="submit"]');
  iniciarLoading(btn);

  try {
    await sendPasswordResetEmail(auth, email);
    mostrarMensagem(resetInfo, 'Link enviado! Verifique seu e-mail.', 'success');
  } catch (err) {
    console.error(err);
    mostrarMensagem(resetInfo, traduzErro(err.code), 'error');
  } finally {
    pararLoading(btn);
  }
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
logoutBtn?.addEventListener('click', () => signOut(auth));
document.getElementById('admin-logout-btn')?.addEventListener('click', () => signOut(auth));
document.getElementById('dashboard-logout-btn')?.addEventListener('click', () => signOut(auth));

// ── HOME ──────────────────────────────────────────────────────────────────────
async function carregarDadosHome(user, data) {
  const nome   = data?.nome   || user.displayName || user.email?.split('@')[0] || 'Parceiro';
  const crmv   = data?.crmv   || '—';
  const pontos = typeof data?.pontos === 'number' ? data.pontos : 0;

  if (userNameSpan)   userNameSpan.textContent  = nome;
  if (cardUserNameEl) cardUserNameEl.textContent = nome;
  if (cardUserCrmvEl) cardUserCrmvEl.textContent = crmv;

  animarContador(pointsValueEl, 0, pontos, 1200);

  const msg = encodeURIComponent(`Olá, sou o(a) Dr(a). ${nome} e gostaria de trocar meus Biovet Pontos.`);
  if (whatsappLink) whatsappLink.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;

  await carregarCarrosel();
}

// ── CARROSEL ──────────────────────────────────────────────────────────────────
async function carregarCarrosel() {
  try {
    const snap = await getDoc(doc(db, 'config', 'carousel'));
    const data = snap.exists() ? snap.data() : {};
    carouselImages = [data.slot0, data.slot1, data.slot2].filter(Boolean);

    if (carouselImages.length === 0) return;

    const carousel = document.getElementById('home-carousel');
    const track    = document.getElementById('carousel-track');
    const dotsEl   = document.getElementById('carousel-dots');

    carousel.style.display = '';
    track.innerHTML  = '';
    dotsEl.innerHTML = '';

    carouselImages.forEach((src, i) => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'carousel-slide';
      img.alt = `Promoção ${i + 1}`;
      track.appendChild(img);

      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => irParaSlide(i));
      dotsEl.appendChild(dot);
    });

    carouselIndex = 0;
    iniciarTimerCarrosel();
  } catch (err) {
    console.error('Carrosel:', err);
  }
}

function irParaSlide(idx) {
  carouselIndex = idx;
  const track = document.getElementById('carousel-track');
  if (track) track.style.transform = `translateX(-${idx * 100}%)`;
  document.querySelectorAll('#carousel-dots .carousel-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });
}

function iniciarTimerCarrosel() {
  if (carouselTimer) clearInterval(carouselTimer);
  if (carouselImages.length < 2) return;
  carouselTimer = setInterval(() => {
    const next = (carouselIndex + 1) % carouselImages.length;
    irParaSlide(next);
  }, 4500);
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
async function carregarAdmin() {
  // Carrega cotação
  try {
    const snap = await getDoc(doc(db, 'config', 'settings'));
    if (snap.exists()) {
      const d = snap.data();
      const pontosInput = document.getElementById('cotacao-pontos');
      const valorInput  = document.getElementById('cotacao-valor');
      if (pontosInput) pontosInput.value = d.pontosBase ?? 1000;
      if (valorInput)  valorInput.value  = d.valorReais ?? 15;
    }
  } catch (err) {
    console.error(err);
  }

  // Carrega todos os usuários
  try {
    const q    = query(collection(db, 'users'), orderBy('nome'));
    const snap = await getDocs(q);
    adminAllUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderAdminUsers('');
  } catch (err) {
    console.error(err);
    const el = document.getElementById('admin-users-list');
    if (el) el.innerHTML = '<p class="empty-state">Erro ao carregar usuários.</p>';
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
      btn.classList.add('tab-btn--active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(btn.dataset.tab)?.classList.remove('hidden');
      if (btn.dataset.tab === 'tab-resgates') {
        carregarResgatesPendentes();
        carregarResgatesHistorico();
      }
    });
  });

  // Search
  document.getElementById('admin-search')?.addEventListener('input', (e) => {
    renderAdminUsers(e.target.value.trim().toLowerCase());
  });

  // Salvar cotação
  document.getElementById('btn-salvar-cotacao')?.addEventListener('click', salvarCotacao);

  // Modal
  document.getElementById('btn-modal-cancel')?.addEventListener('click', fecharModal);
  document.getElementById('btn-modal-save')?.addEventListener('click', salvarPontosModal);
}

function renderAdminUsers(filtro) {
  const el = document.getElementById('admin-users-list');
  if (!el) return;

  const lista = filtro
    ? adminAllUsers.filter(u =>
        u.nome?.toLowerCase().includes(filtro) ||
        u.crmv?.toLowerCase().includes(filtro) ||
        u.email?.toLowerCase().includes(filtro)
      )
    : adminAllUsers;

  // Exclui admins e dashboards da lista
  const parceiros = lista.filter(u => { const r = (u.role || '').trim(); return !r || r === 'vet'; });

  if (parceiros.length === 0) {
    el.innerHTML = '<p class="empty-state">Nenhum parceiro encontrado.</p>';
    return;
  }

  el.innerHTML = parceiros.map(u => `
    <div class="user-card">
      <div class="user-card-header">
        <div>
          <div class="user-card-name">${esc(u.nome || '—')}</div>
          <div class="user-card-meta">CRMV: ${esc(u.crmv || '—')} &nbsp;·&nbsp; ${esc(u.email || '—')}</div>
        </div>
        <span class="status-badge ${u.approved ? 'status-badge--approved' : 'status-badge--pending'}">
          ${u.approved ? 'Aprovado' : 'Pendente'}
        </span>
      </div>
      <div class="user-card-footer">
        <div class="user-card-points">
          ${(u.pontos ?? 0).toLocaleString('pt-BR')}<span>pontos</span>
        </div>
        <div class="user-card-actions">
          <button class="btn-sm btn-sm--teal" onclick="abrirModalPontos('${u.uid}')">Pontos</button>
          ${u.approved
            ? `<button class="btn-sm btn-sm--red" onclick="toggleAprovacao('${u.uid}', false)">Revogar</button>`
            : `<button class="btn-sm btn-sm--green" onclick="toggleAprovacao('${u.uid}', true)">Aprovar</button>`
          }
        </div>
      </div>
    </div>
  `).join('');
}

window.abrirModalPontos = function(uid) {
  const user = adminAllUsers.find(u => u.uid === uid);
  if (!user) return;
  currentEditUid = uid;
  document.getElementById('modal-user-label').textContent = user.nome || user.email || uid;
  document.getElementById('modal-pontos-input').value = user.pontos ?? 0;
  limparMensagem(document.getElementById('modal-msg'));
  document.getElementById('modal-pontos').classList.remove('hidden');
};

function fecharModal() {
  document.getElementById('modal-pontos').classList.add('hidden');
  currentEditUid = null;
}

async function salvarPontosModal() {
  if (!currentEditUid) return;
  const val = parseInt(document.getElementById('modal-pontos-input').value, 10);
  if (isNaN(val) || val < 0) {
    mostrarMensagem(document.getElementById('modal-msg'), 'Valor inválido.', 'error');
    return;
  }
  const btn = document.getElementById('btn-modal-save');
  iniciarLoading(btn);
  try {
    await updateDoc(doc(db, 'users', currentEditUid), { pontos: val });
    const u = adminAllUsers.find(u => u.uid === currentEditUid);
    if (u) u.pontos = val;
    renderAdminUsers(document.getElementById('admin-search')?.value.trim().toLowerCase() || '');
    fecharModal();
  } catch (err) {
    console.error(err);
    mostrarMensagem(document.getElementById('modal-msg'), 'Erro ao salvar. Tente novamente.', 'error');
  } finally {
    pararLoading(btn);
  }
}

window.toggleAprovacao = async function(uid, aprovar) {
  try {
    await updateDoc(doc(db, 'users', uid), { approved: aprovar });
    const u = adminAllUsers.find(u => u.uid === uid);
    if (u) u.approved = aprovar;
    renderAdminUsers(document.getElementById('admin-search')?.value.trim().toLowerCase() || '');
  } catch (err) {
    console.error(err);
    alert('Erro ao atualizar aprovação. Tente novamente.');
  }
};

async function salvarCotacao() {
  const pontosBase = parseInt(document.getElementById('cotacao-pontos')?.value, 10);
  const valorReais = parseFloat(document.getElementById('cotacao-valor')?.value);
  const msgEl      = document.getElementById('cotacao-msg');

  if (isNaN(pontosBase) || pontosBase <= 0 || isNaN(valorReais) || valorReais < 0) {
    mostrarMensagem(msgEl, 'Valores inválidos.', 'error');
    return;
  }

  const btn = document.getElementById('btn-salvar-cotacao');
  iniciarLoading(btn);
  try {
    await setDoc(doc(db, 'config', 'settings'), { pontosBase, valorReais }, { merge: true });
    mostrarMensagem(msgEl, 'Cotação salva com sucesso!', 'success');
  } catch (err) {
    console.error(err);
    mostrarMensagem(msgEl, 'Erro ao salvar. Tente novamente.', 'error');
  } finally {
    pararLoading(btn);
  }
}

// ── ADMIN RESGATES ────────────────────────────────────────────────────────────
let _resgateAtual = null; // resgate sendo finalizado

async function carregarResgatesPendentes() {
  const el = document.getElementById('admin-resgates-pendentes');
  if (!el) return;
  el.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const q    = query(collection(db, 'resgates'), where('status', '==', 'pendente'), orderBy('criadoEm', 'desc'));
    const snap = await getDocs(q);
    renderResgateCards(el, snap.docs, true);
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="empty-state">Erro ao carregar resgates.</p>';
  }
}

async function carregarResgatesHistorico() {
  const el = document.getElementById('admin-resgates-historico');
  if (!el) return;
  el.innerHTML = '<p class="empty-state">Carregando...</p>';
  try {
    const q    = query(collection(db, 'resgates'), where('status', '==', 'finalizado'), orderBy('criadoEm', 'desc'));
    const snap = await getDocs(q);
    renderResgateCards(el, snap.docs, false);
  } catch (err) {
    console.error(err);
    el.innerHTML = '<p class="empty-state">Erro ao carregar histórico.</p>';
  }
}

function renderResgateCards(container, docs, comAcao) {
  if (docs.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum registro encontrado.</p>';
    return;
  }
  container.innerHTML = docs.map(d => {
    const r   = d.data();
    const rid = d.id;
    const status = r.status === 'finalizado' ? 'finalizado' : 'pendente';
    return `
      <div class="resgate-card resgate-card--${status}">
        <div class="resgate-card-header">
          <span class="resgate-card-vet">${esc(r.vetNome || '—')}</span>
          <span class="resgate-card-data">${formatarDataHora(r.criadoEm)}</span>
        </div>
        <div class="resgate-card-info">
          <span>CRMV: ${esc(r.vetCrmv || '—')}</span>
          <span>CPF: ${mascararCpf(r.vetCpf)}</span>
          <span class="resgate-card-estab">Estabelecimento: ${esc(r.estabelecimento || '—')}</span>
          <span class="resgate-card-pontos">${(r.pontosResgatados || 0).toLocaleString('pt-BR')} pts</span>
        </div>
        <div class="resgate-card-info">
          <span>Protocolo: ${esc(r.protocolo || rid.slice(0, 8).toUpperCase())}</span>
          <span><span class="badge-status badge-status--${status}">${status}</span></span>
        </div>
        ${comAcao ? `
        <div class="resgate-card-actions">
          <button class="btn btn-primary" onclick="abrirModalFinalizarResgate('${rid}')">Finalizar</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

window.abrirModalFinalizarResgate = function(resgateId) {
  const docs = document.querySelectorAll('.resgate-card');
  // busca o resgate nos dados já renderizados via atributo
  _resgateAtual = { id: resgateId };
  const msgEl = document.getElementById('finalizar-resgate-msg');
  limparMensagem(msgEl);
  document.getElementById('finalizar-comprovante-input').value = '';
  document.getElementById('finalizar-resgate-label').textContent = `Resgate ID: ${resgateId.slice(0, 8).toUpperCase()}`;
  document.getElementById('modal-finalizar-resgate').classList.remove('hidden');
};

window.fecharModalFinalizarResgate = function() {
  document.getElementById('modal-finalizar-resgate').classList.add('hidden');
  _resgateAtual = null;
};

window.confirmarFinalizarResgate = async function() {
  if (!_resgateAtual) return;
  const rid    = _resgateAtual.id;
  const fileEl = document.getElementById('finalizar-comprovante-input');
  const msgEl  = document.getElementById('finalizar-resgate-msg');
  const btn    = document.getElementById('btn-finalizar-confirmar');
  limparMensagem(msgEl);

  iniciarLoading(btn);
  try {
    // 1. Busca o resgate para obter vetUid e pontosResgatados
    const resgateSnap = await getDoc(doc(db, 'resgates', rid));
    if (!resgateSnap.exists()) throw new Error('Resgate não encontrado.');
    const resgate = resgateSnap.data();
    if (resgate.status !== 'pendente') {
      mostrarMensagem(msgEl, 'Este resgate já foi finalizado.', 'error');
      return;
    }

    // 2. Upload do comprovante (se fornecido)
    let comprovanteUrl = null;
    const file = fileEl?.files?.[0];
    if (file) {
      const ref  = storageRef(storage, `comprovantes/${rid}`);
      await uploadBytes(ref, file);
      comprovanteUrl = await getDownloadURL(ref);
    }

    // 3. Transação: debita pontos do vet e marca resgate como finalizado
    const userRef    = doc(db, 'users', resgate.vetUid);
    const resgateRef = doc(db, 'resgates', rid);
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('Usuário não encontrado.');
      const pontosAtuais = userSnap.data().pontos || 0;
      if (pontosAtuais < resgate.pontosResgatados) throw new Error('Saldo insuficiente.');
      tx.update(userRef,    { pontos: pontosAtuais - resgate.pontosResgatados });
      tx.update(resgateRef, {
        status: 'finalizado',
        finalizadoEm: serverTimestamp(),
        ...(comprovanteUrl ? { comprovanteUrl } : {})
      });
    });

    mostrarMensagem(msgEl, 'Resgate finalizado com sucesso!', 'success');
    setTimeout(() => {
      fecharModalFinalizarResgate();
      carregarResgatesPendentes();
      carregarResgatesHistorico();
    }, 1200);
  } catch (err) {
    console.error(err);
    mostrarMensagem(msgEl, err.message || 'Erro ao finalizar resgate.', 'error');
  } finally {
    pararLoading(btn);
  }
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function carregarDashboard() {
  // Cotação
  try {
    const snap = await getDoc(doc(db, 'config', 'settings'));
    if (snap.exists()) {
      const d = snap.data();
      dashCotacao.pontosBase = d.pontosBase ?? 1000;
      dashCotacao.valorReais = d.valorReais ?? 15;
    }
  } catch (err) {
    console.error(err);
  }
  atualizarTextoCotacaoDash();

  // Busca
  const searchInput = document.getElementById('dash-search');
  const searchBtn   = document.getElementById('btn-dash-search');
  searchBtn?.addEventListener('click', () => executarBuscaDash(searchInput?.value.trim()));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executarBuscaDash(searchInput.value.trim());
  });

  // Slots carrosel
  await carregarSlotsCarrosel();
}

function atualizarTextoCotacaoDash() {
  const el = document.getElementById('dash-cotacao-text');
  if (!el) return;
  const pts = dashCotacao.pontosBase.toLocaleString('pt-BR');
  const val = dashCotacao.valorReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  el.textContent = `${pts} pts = R$ ${val}`;
}

async function executarBuscaDash(termo) {
  const resultEl = document.getElementById('dash-result');
  if (!resultEl) return;
  if (!termo) {
    resultEl.innerHTML = '';
    return;
  }

  resultEl.innerHTML = '<p class="empty-state">Buscando…</p>';

  try {
    const q    = query(collection(db, 'users'), orderBy('nome'));
    const snap = await getDocs(q);
    const termoLower = termo.toLowerCase();

    const encontrados = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => {
        const r = (u.role || '').trim();
        return (!r || r === 'vet') &&
          (u.nome?.toLowerCase().includes(termoLower) || u.crmv?.toLowerCase().includes(termoLower));
      });

    if (encontrados.length === 0) {
      resultEl.innerHTML = '<p class="empty-state">Nenhum parceiro encontrado.</p>';
      return;
    }

    resultEl.innerHTML = encontrados.map(u => {
      const pontos  = u.pontos ?? 0;
      const equiv   = calcEquivalencia(pontos);
      return `
        <div class="dash-user-card">
          <div>
            <div class="dash-user-name">${esc(u.nome || '—')}</div>
            <div class="dash-user-meta">CRMV: ${esc(u.crmv || '—')} &nbsp;·&nbsp; ${esc(u.email || '—')}</div>
          </div>
          <div class="dash-user-points">
            <span class="dash-points-num">${pontos.toLocaleString('pt-BR')}</span>
            <span class="dash-points-label">pontos</span>
          </div>
          ${equiv ? `<div class="dash-cotacao-equiv">≈ R$ ${equiv}</div>` : ''}
          <button class="btn btn-primary btn-block" style="margin-top:8px"
            onclick="abrirModalResgate('${esc(u.uid)}','${esc(u.nome || '')}','${esc(u.crmv || '')}','${esc(u.cpf || '')}',${pontos})">
            Trocar pontos
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    resultEl.innerHTML = '<p class="empty-state">Erro na busca. Tente novamente.</p>';
  }
}

function calcEquivalencia(pontos) {
  if (!dashCotacao.pontosBase || !dashCotacao.valorReais) return null;
  const valor = (pontos / dashCotacao.pontosBase) * dashCotacao.valorReais;
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── CARROSEL UPLOAD (Dashboard) ───────────────────────────────────────────────
async function carregarSlotsCarrosel() {
  const container = document.getElementById('carousel-slots');
  if (!container) return;

  let carouselData = {};
  try {
    const snap = await getDoc(doc(db, 'config', 'carousel'));
    if (snap.exists()) carouselData = snap.data();
  } catch (err) {
    console.error(err);
  }

  container.innerHTML = '';

  [0, 1, 2].forEach(i => {
    const slotKey = `slot${i}`;
    const url     = carouselData[slotKey] || '';

    const slot = document.createElement('div');
    slot.className = 'carousel-slot';
    slot.innerHTML = `
      ${url
        ? `<img src="${url}" class="carousel-slot-preview" alt="Imagem ${i + 1}">`
        : `<div class="carousel-slot-empty">
             <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
               <rect x="3" y="3" width="18" height="18" rx="3"/>
               <circle cx="8.5" cy="8.5" r="1.5"/>
               <polyline points="21 15 16 10 5 21"/>
             </svg>
             <span>Sem imagem</span>
           </div>`
      }
      <div class="carousel-slot-footer">
        <span class="carousel-slot-label">Imagem ${i + 1}</span>
        <div class="carousel-slot-actions">
          <label class="btn-sm btn-sm--teal" style="cursor:pointer">
            Upload
            <input type="file" accept="image/*" style="display:none" data-slot="${i}" class="slot-file-input">
          </label>
          ${url ? `<button class="btn-sm btn-sm--red" data-slot="${i}" onclick="removerImagemSlot(${i})">Remover</button>` : ''}
        </div>
      </div>
    `;
    container.appendChild(slot);
  });

  container.querySelectorAll('.slot-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('Imagem muito grande. Máximo 2 MB.');
        return;
      }
      const slotIdx = parseInt(input.dataset.slot, 10);
      await uploadImagemSlot(slotIdx, file);
    });
  });
}

async function uploadImagemSlot(slotIdx, file) {
  const container = document.getElementById('carousel-slots');
  const slots     = container?.querySelectorAll('.carousel-slot');
  const slot      = slots?.[slotIdx];
  if (!slot) return;

  const uploadLabel = slot.querySelector('label.btn-sm');
  if (uploadLabel) { uploadLabel.textContent = 'Enviando…'; uploadLabel.style.opacity = '0.6'; }

  try {
    const base64 = await redimensionarImagem(file);
    const slotKey = `slot${slotIdx}`;
    await setDoc(doc(db, 'config', 'carousel'), { [slotKey]: base64 }, { merge: true });
    await carregarSlotsCarrosel();
  } catch (err) {
    console.error(err);
    alert('Erro ao fazer upload. Tente novamente.');
    if (uploadLabel) { uploadLabel.textContent = 'Upload'; uploadLabel.style.opacity = '1'; }
  }
}

window.removerImagemSlot = async function(slotIdx) {
  if (!confirm(`Remover imagem ${slotIdx + 1}?`)) return;
  try {
    await setDoc(doc(db, 'config', 'carousel'), { [`slot${slotIdx}`]: '' }, { merge: true });
    await carregarSlotsCarrosel();
  } catch (err) {
    console.error(err);
    alert('Erro ao remover. Tente novamente.');
  }
};

function redimensionarImagem(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio  = Math.min(maxWidth / img.width, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── COMPROVANTE DE RESGATE ────────────────────────────────────────────────────
function abrirComprovante(dados) {
  const v = document.getElementById('print-comprovante-view');
  if (!v) return;

  const dataHora = dados.solicitadoEm
    ? (dados.solicitadoEm.toDate
        ? dados.solicitadoEm.toDate()
        : new Date(dados.solicitadoEm)
      ).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
    : new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

  const cotStr = `${(dados.cotacaoSnapshot?.pontosBase ?? 1000).toLocaleString('pt-BR')} pts = R$ ${
    (dados.cotacaoSnapshot?.valorReais ?? 15).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  document.getElementById('comp-protocolo').textContent  = dados.protocolo || '—';
  document.getElementById('comp-data').textContent       = dataHora;
  document.getElementById('comp-vet-nome').textContent   = dados.vetNome || '—';
  document.getElementById('comp-vet-crmv').textContent   = dados.vetCrmv || '—';
  document.getElementById('comp-vet-cpf').textContent    = mascararCpf(dados.vetCpf);
  document.getElementById('comp-estab').textContent      = dados.estabelecimento || '—';
  document.getElementById('comp-pontos').textContent     = (dados.pontosResgatados || 0).toLocaleString('pt-BR');
  document.getElementById('comp-valor').textContent      = 'R$ ' + (dados.valorReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  document.getElementById('comp-cotacao').textContent    = cotStr;

  ocultarTodasViews();
  v.classList.add('active');
  window.scrollTo(0, 0);
}

window.fecharComprovante = function() {
  const v = document.getElementById('print-comprovante-view');
  if (v) v.classList.remove('active');
  mostrarDashboardView();
};

// ── MODAL DE RESGATE (Dashboard) ──────────────────────────────────────────────
let resgateAtual = null; // { vetUid, vetNome, vetCrmv, vetCpf, pontosDisponiveis }

window.abrirModalResgate = function(vetUid, vetNome, vetCrmv, vetCpf, pontosDisponiveis) {
  resgateAtual = { vetUid, vetNome, vetCrmv, vetCpf, pontosDisponiveis };

  document.getElementById('resgate-vet-label').textContent =
    `${vetNome || '—'} · CRMV: ${vetCrmv || '—'}`;
  document.getElementById('resgate-pontos-max').textContent =
    pontosDisponiveis.toLocaleString('pt-BR');

  const inputPontos = document.getElementById('resgate-pontos-input');
  inputPontos.value = '';
  inputPontos.max   = pontosDisponiveis;

  document.getElementById('resgate-estabelecimento').value = '';
  document.getElementById('resgate-valor-calc').textContent = '—';
  document.getElementById('btn-resgate-confirmar').disabled = true;
  limparMensagem(document.getElementById('resgate-msg'));

  document.getElementById('modal-resgate').classList.remove('hidden');
};

function fecharModalResgate() {
  document.getElementById('modal-resgate').classList.add('hidden');
  resgateAtual = null;
}

function atualizarValorResgate() {
  const inputPontos = document.getElementById('resgate-pontos-input');
  const pts = parseInt(inputPontos.value, 10) || 0;
  const max = resgateAtual?.pontosDisponiveis ?? 0;
  const estabelecimento = document.getElementById('resgate-estabelecimento').value.trim();

  const valido = pts > 0 && pts <= max && !!estabelecimento;
  document.getElementById('btn-resgate-confirmar').disabled = !valido;

  if (pts > 0 && dashCotacao.pontosBase) {
    const valor = (pts / dashCotacao.pontosBase) * dashCotacao.valorReais;
    document.getElementById('resgate-valor-calc').textContent =
      'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  } else {
    document.getElementById('resgate-valor-calc').textContent = '—';
  }
}

async function confirmarResgate() {
  if (!resgateAtual) return;

  const pontosResgatados = parseInt(document.getElementById('resgate-pontos-input').value, 10);
  const estabelecimento  = document.getElementById('resgate-estabelecimento').value.trim();
  const msgEl            = document.getElementById('resgate-msg');

  if (!estabelecimento) {
    mostrarMensagem(msgEl, 'Informe o nome do estabelecimento.', 'error');
    return;
  }
  if (!pontosResgatados || pontosResgatados <= 0) {
    mostrarMensagem(msgEl, 'Informe os pontos a resgatar.', 'error');
    return;
  }
  if (pontosResgatados > resgateAtual.pontosDisponiveis) {
    mostrarMensagem(msgEl, 'Pontos insuficientes.', 'error');
    return;
  }

  const valorReais = (pontosResgatados / dashCotacao.pontosBase) * dashCotacao.valorReais;
  const btn = document.getElementById('btn-resgate-confirmar');
  iniciarLoading(btn);

  try {
    const currentUser = auth.currentUser;
    const userSnap    = await getDoc(doc(db, 'users', currentUser.uid));
    const dashNome    = userSnap.exists() ? (userSnap.data().nome || currentUser.email) : currentUser.email;

    const docRef = await addDoc(collection(db, 'resgates'), {
      vetUid:           resgateAtual.vetUid,
      vetNome:          resgateAtual.vetNome,
      vetCrmv:          resgateAtual.vetCrmv,
      vetCpf:           resgateAtual.vetCpf,
      estabelecimento,
      pontosResgatados,
      valorReais,
      cotacaoSnapshot:  { pontosBase: dashCotacao.pontosBase, valorReais: dashCotacao.valorReais },
      status:           'pendente',
      solicitadoPor:    { uid: currentUser.uid, nome: dashNome },
      solicitadoEm:     serverTimestamp(),
      comprovanteUrl:   null,
      finalizadoEm:     null,
      finalizadoPor:    null,
    });

    fecharModalResgate();
    abrirComprovante({
      protocolo:        docRef.id,
      vetNome:          resgateAtual.vetNome,
      vetCrmv:          resgateAtual.vetCrmv,
      vetCpf:           resgateAtual.vetCpf,
      estabelecimento,
      pontosResgatados,
      valorReais,
      cotacaoSnapshot:  { pontosBase: dashCotacao.pontosBase, valorReais: dashCotacao.valorReais },
      solicitadoEm:     new Date(),
    });
  } catch (err) {
    console.error(err);
    mostrarMensagem(msgEl, 'Erro ao registrar resgate. Tente novamente.', 'error');
  } finally {
    pararLoading(btn);
  }
}

// ── UTILITÁRIOS DE UI ─────────────────────────────────────────────────────────
function animarContador(el, de, para, duracao) {
  if (!el) return;
  if (para === 0) { el.textContent = '0'; return; }
  const inicio = performance.now();
  const diff   = para - de;
  function passo(agora) {
    const p = Math.min((agora - inicio) / duracao, 1);
    const s = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(de + diff * s).toLocaleString('pt-BR');
    if (p < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

function mostrarMensagem(el, msg, tipo) {
  if (!el) return;
  el.textContent = msg;
  el.className   = 'form-msg visible ' + tipo;
  el.style.animation = 'none';
  void el.offsetHeight;
  if (tipo === 'error') el.style.animation = 'shake 0.35s ease';
}

function limparMensagem(el) {
  if (!el) return;
  el.textContent = '';
  el.className   = 'form-msg';
}

function iniciarLoading(btn) {
  if (!btn) return;
  btn.disabled         = true;
  btn.dataset.original = btn.textContent;
  btn.textContent      = 'Aguarde…';
  btn.style.opacity    = '0.7';
}

function pararLoading(btn) {
  if (!btn) return;
  btn.disabled      = false;
  btn.textContent   = btn.dataset.original || btn.textContent;
  btn.style.opacity = '1';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mascararCpf(cpf) {
  const limpo = String(cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return cpf || '—';
  return `${limpo.slice(0, 3)}.***.***-${limpo.slice(-2)}`;
}

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// ── ERROS FIREBASE ────────────────────────────────────────────────────────────
function traduzErro(code) {
  const mapa = {
    'auth/invalid-email':        'E-mail inválido.',
    'auth/user-disabled':        'Usuário desativado.',
    'auth/user-not-found':       'E-mail não cadastrado.',
    'auth/wrong-password':       'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/weak-password':        'Senha fraca. Use pelo menos 6 caracteres.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
    'auth/too-many-requests':    'Muitas tentativas. Aguarde alguns minutos.',
  };
  return mapa[code] || 'Ocorreu um erro. Tente novamente.';
}

// ── SERVICE WORKER ────────────────────────────────────────────────────────────
function mostrarToastAtualizacao(onConfirm) {
  let toast = document.getElementById('sw-update-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sw-update-toast';
    toast.innerHTML = `
      <span>Nova versão disponível.</span>
      <button id="sw-update-btn">Atualizar</button>
    `;
    document.body.appendChild(toast);
  }
  toast.classList.add('sw-toast--visible');
  document.getElementById('sw-update-btn').onclick = () => {
    toast.classList.remove('sw-toast--visible');
    onConfirm();
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      setInterval(() => reg.update(), 30 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            mostrarToastAtualizacao(() => {
              newSW.postMessage({ type: 'SKIP_WAITING' });
            });
          }
        });
      });
    }).catch(err => console.error('SW:', err));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
}
