import { initializeApp }   from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getMessaging,
  getToken,
  onMessage
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging.js';
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
  serverTimestamp,
  onSnapshot
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

const WHATSAPP_NUMBER = '5514997132879';

// FCM — preencha com a VAPID key gerada em Firebase Console →
// Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
const FCM_VAPID_KEY = 'BH81Reb3fur3nveHNT2Gs3f6kenyEO93jv37csFRlxpDLIFHREjqhSQ9oopN6E4qt1Ywkf3azdHOCxZwKq8hNNA';

// ── FIREBASE ──────────────────────────────────────────────────────────────────
const fbApp     = initializeApp(firebaseConfig);
const auth      = getAuth(fbApp);
const db        = getFirestore(fbApp);
const storage   = getStorage(fbApp);
const messaging = getMessaging(fbApp);

// ── ESTADO ───────────────────────────────────────────────────────────────────
let isRegistering      = false;
let adminAllUsers      = [];
let currentEditUid     = null;
let carouselImages     = [];
let carouselIndex      = 0;
let carouselTimer      = null;
let dashCotacao        = { pontosBase: 1000, valorReais: 15 };
let _usuarioAtual      = null;  // { uid, role, nome } — preenchido no onAuthStateChanged

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

      _usuarioAtual = { uid: user.uid, role, nome: data.nome || user.email };

      if (role === 'admin') {
        await carregarAdmin();
        mostrarAdminView();
        inicializarSino(user.uid, role);
        configurarFCM(user.uid);
      } else if (role === 'dashboard') {
        await carregarDashboard();
        mostrarDashboardView();
        inicializarSino(user.uid, role);
        configurarFCM(user.uid);
      } else if (role === 'vet2' || role === 'escritor') {
        window.location.replace('/guia/');
        return;
      } else if (data.approved === true) {
        await carregarDadosHome(user, data);
        mostrarHomeView();
        inicializarSino(user.uid, role);
        configurarFCM(user.uid);
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

    // Notifica todos os admins sobre novo cadastro pendente
    await criarNotificacao({
      destinatarioRole: 'admin',
      tipo:     'novo_cadastro',
      titulo:   'Novo cadastro aguardando aprovação',
      mensagem: `${nome} (CRMV ${crmv}) se cadastrou e aguarda aprovação.`,
      metadata: { vetNome: nome, vetCrmv: crmv, vetEmail: email }
    });

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
      // Cancela listeners de resgates ao sair da aba
      if (btn.dataset.tab !== 'tab-resgates') {
        if (_unsubPendentes) { _unsubPendentes(); _unsubPendentes = null; }
        if (_unsubHistorico) { _unsubHistorico(); _unsubHistorico = null; }
      }
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

    // Notifica o veterinário que seus pontos foram atualizados
    await criarNotificacao({
      destinatarioUid:  currentEditUid,
      destinatarioRole: 'vet',
      tipo:     'pontos_atualizados',
      titulo:   'Sua pontuação foi atualizada',
      mensagem: `Seu saldo foi atualizado para ${val.toLocaleString('pt-BR')} pontos.`,
      metadata: { novoPontos: val }
    });

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

    // Notifica o veterinário sobre aprovação ou revogação
    if (aprovar) {
      await criarNotificacao({
        destinatarioUid:  uid,
        destinatarioRole: 'vet',
        tipo:     'cadastro_aprovado',
        titulo:   'Cadastro aprovado!',
        mensagem: 'Seu cadastro no Biovet Pontos foi aprovado. Bem-vindo!',
        metadata: { vetUid: uid }
      });
    }
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
let _resgateAtual           = null; // resgate sendo finalizado
let _unsubPendentes         = null; // listener onSnapshot pendentes
let _unsubHistorico         = null; // listener onSnapshot historico

function carregarResgatesPendentes() {
  const el = document.getElementById('admin-resgates-pendentes');
  if (!el) return;
  el.innerHTML = '<p class="empty-state">Carregando...</p>';

  // Cancela listener anterior se existir
  if (_unsubPendentes) { _unsubPendentes(); _unsubPendentes = null; }

  // Campo correto é solicitadoEm (não criadoEm)
  const q = query(
    collection(db, 'resgates'),
    where('status', '==', 'pendente'),
    orderBy('solicitadoEm', 'desc')
  );
  _unsubPendentes = onSnapshot(q,
    snap => renderResgateCards(el, snap.docs, true),
    err  => {
      console.error('resgates pendentes:', err);
      el.innerHTML = '<p class="empty-state">Erro ao carregar resgates. Verifique as Security Rules.</p>';
    }
  );
}

function carregarResgatesHistorico() {
  const el = document.getElementById('admin-resgates-historico');
  if (!el) return;
  el.innerHTML = '<p class="empty-state">Carregando...</p>';

  if (_unsubHistorico) { _unsubHistorico(); _unsubHistorico = null; }

  const q = query(
    collection(db, 'resgates'),
    where('status', '==', 'finalizado'),
    orderBy('solicitadoEm', 'desc')
  );
  _unsubHistorico = onSnapshot(q,
    snap => renderResgateCards(el, snap.docs, false),
    err  => {
      console.error('resgates historico:', err);
      el.innerHTML = '<p class="empty-state">Erro ao carregar histórico.</p>';
    }
  );
}

function renderResgateCards(container, docs, comAcao) {
  if (docs.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum registro encontrado.</p>';
    return;
  }
  container.innerHTML = docs.map(d => {
    const r      = d.data();
    const rid    = d.id;
    const status = r.status === 'finalizado' ? 'finalizado' : 'pendente';
    const valor  = r.valorReais
      ? 'R$ ' + r.valorReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '—';
    const solicitante = r.solicitadoPor?.nome || '—';
    return `
      <div class="resgate-card resgate-card--${status}">
        <div class="resgate-card-header">
          <span class="resgate-card-vet">${esc(r.vetNome || '—')}</span>
          <span class="resgate-card-data">${formatarDataHora(r.solicitadoEm)}</span>
        </div>
        <div class="resgate-card-info">
          <span>CRMV: ${esc(r.vetCrmv || '—')}</span>
          <span>CPF: ${mascararCpf(r.vetCpf)}</span>
          <span>ID do Agente: ${esc(r.estabelecimento || '—')}</span>
          <span>Por: ${esc(solicitante)}</span>
        </div>
        <div class="resgate-card-info">
          <span class="resgate-card-pontos">${(r.pontosResgatados || 0).toLocaleString('pt-BR')} pts · ${valor}</span>
          <span><span class="badge-status badge-status--${status}">${status}</span></span>
        </div>
        ${comAcao ? `
        <div class="resgate-card-actions">
          <button class="btn btn-primary" onclick="abrirModalFinalizarResgate('${rid}')">
            Anexar e Finalizar
          </button>
        </div>` : (r.comprovanteUrl ? `
        <div class="resgate-card-actions">
          <a href="${esc(r.comprovanteUrl)}" target="_blank" class="btn btn-outline" style="font-size:0.85rem">
            Ver comprovante
          </a>
        </div>` : '')}
      </div>`;
  }).join('');
}

window.abrirModalFinalizarResgate = function(resgateId) {
  _resgateAtual = { id: resgateId };
  limparMensagem(document.getElementById('finalizar-resgate-msg'));

  const fileInput = document.getElementById('finalizar-comprovante-input');
  const btnFinalizar = document.getElementById('btn-finalizar-confirmar');
  fileInput.value = '';
  btnFinalizar.disabled = true;

  // Habilita o botão apenas após selecionar arquivo
  fileInput.onchange = () => {
    btnFinalizar.disabled = !fileInput.files?.length;
  };

  document.getElementById('finalizar-resgate-label').textContent =
    `Protocolo: ${resgateId.slice(0, 8).toUpperCase()}`;
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

    // Notifica o veterinário que o resgate foi finalizado
    await criarNotificacao({
      destinatarioUid:  resgate.vetUid,
      destinatarioRole: 'vet',
      tipo:     'resgate_finalizado',
      titulo:   'Resgate de pontos finalizado',
      mensagem: `Seu resgate de ${(resgate.pontosResgatados || 0).toLocaleString('pt-BR')} pts foi processado com sucesso.`,
      metadata: { resgateId: rid, pontosResgatados: resgate.pontosResgatados }
    });

    // Notifica o dashboard que solicitou o resgate
    if (resgate.solicitadoPor?.uid) {
      await criarNotificacao({
        destinatarioUid:  resgate.solicitadoPor.uid,
        destinatarioRole: 'dashboard',
        tipo:     'resgate_finalizado',
        titulo:   'Resgate finalizado pelo admin',
        mensagem: `O resgate de ${(resgate.pontosResgatados || 0).toLocaleString('pt-BR')} pts de ${resgate.vetNome} foi aprovado.`,
        metadata: { resgateId: rid, vetNome: resgate.vetNome }
      });
    }

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
    const temImg  = !!url;

    const slot = document.createElement('div');
    slot.className = 'carousel-slot carousel-slot--compact';
    slot.innerHTML = `
      <div class="carousel-slot-status">
        <span class="badge-status ${temImg ? 'badge-status--finalizado' : 'badge-status--pendente'}">
          ${temImg ? 'Ativa' : 'Vazia'}
        </span>
        <span class="carousel-slot-label">Imagem ${i + 1}</span>
      </div>
      <div class="carousel-slot-actions">
        <label class="btn-sm btn-sm--teal" style="cursor:pointer">
          ${temImg ? 'Substituir' : 'Upload'}
          <input type="file" accept="image/*" style="display:none" data-slot="${i}" class="slot-file-input">
        </label>
        ${temImg ? `<button class="btn-sm btn-sm--red" onclick="removerImagemSlot(${i})">Remover</button>` : ''}
      </div>
    `;
    container.appendChild(slot);
  });

  container.querySelectorAll('.slot-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        mostrarMensagem(document.getElementById('cotacao-msg'), 'Imagem muito grande. Máximo 2 MB.', 'error');
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

  const label = slot.querySelector('label.btn-sm');
  if (label) { label.textContent = 'Enviando…'; label.style.opacity = '0.6'; }

  try {
    const ref  = storageRef(storage, `carousel/slot${slotIdx}.jpg`);
    await uploadBytes(ref, file);
    const url  = await getDownloadURL(ref);
    await setDoc(doc(db, 'config', 'carousel'), { [`slot${slotIdx}`]: url }, { merge: true });
    await carregarSlotsCarrosel();
  } catch (err) {
    console.error(err);
    mostrarMensagem(document.getElementById('cotacao-msg'), 'Erro ao fazer upload. Tente novamente.', 'error');
    if (label) { label.textContent = 'Upload'; label.style.opacity = '1'; }
  }
}

window.removerImagemSlot = async function(slotIdx) {
  try {
    const ref = storageRef(storage, `carousel/slot${slotIdx}.jpg`);
    await deleteObject(ref).catch(() => {}); // ignora se não existir no Storage
    await setDoc(doc(db, 'config', 'carousel'), { [`slot${slotIdx}`]: '' }, { merge: true });
    await carregarSlotsCarrosel();
  } catch (err) {
    console.error(err);
    mostrarMensagem(document.getElementById('cotacao-msg'), 'Erro ao remover. Tente novamente.', 'error');
  }
};

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
  inputPontos.min   = 1000;
  inputPontos.step  = 1000;

  document.getElementById('resgate-estabelecimento').value = '';
  document.getElementById('resgate-valor-calc').textContent = '—';
  document.getElementById('btn-resgate-confirmar').disabled = true;
  limparMensagem(document.getElementById('resgate-msg'));

  document.getElementById('modal-resgate').classList.remove('hidden');
};

window.fecharModalResgate = function() {
  document.getElementById('modal-resgate').classList.add('hidden');
  resgateAtual = null;
};

window.atualizarValorResgate = function() {
  const inputPontos = document.getElementById('resgate-pontos-input');
  const pts  = parseInt(inputPontos.value, 10) || 0;
  const max  = resgateAtual?.pontosDisponiveis ?? 0;
  const agente = document.getElementById('resgate-estabelecimento').value.trim();
  const msgEl  = document.getElementById('resgate-msg');

  const multiplo1000 = pts > 0 && pts % 1000 === 0;
  const valido = multiplo1000 && pts >= 1000 && pts <= max && !!agente;

  document.getElementById('btn-resgate-confirmar').disabled = !valido;

  if (pts > 0 && !multiplo1000) {
    mostrarMensagem(msgEl, 'O valor deve ser múltiplo de 1.000 pontos.', 'error');
  } else if (pts > max && max > 0) {
    mostrarMensagem(msgEl, 'Valor superior aos pontos disponíveis.', 'error');
  } else {
    limparMensagem(msgEl);
  }

  if (pts > 0 && dashCotacao.pontosBase) {
    const valor = (pts / dashCotacao.pontosBase) * dashCotacao.valorReais;
    document.getElementById('resgate-valor-calc').textContent =
      'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  } else {
    document.getElementById('resgate-valor-calc').textContent = '—';
  }
};

window.confirmarResgate = async function() {
  if (!resgateAtual) return;

  const pontosResgatados = parseInt(document.getElementById('resgate-pontos-input').value, 10);
  const agente           = document.getElementById('resgate-estabelecimento').value.trim();
  const msgEl            = document.getElementById('resgate-msg');

  if (!agente) {
    mostrarMensagem(msgEl, 'Informe o ID do agente.', 'error');
    return;
  }
  if (!pontosResgatados || pontosResgatados < 1000) {
    mostrarMensagem(msgEl, 'Mínimo de 1.000 pontos para resgatar.', 'error');
    return;
  }
  if (pontosResgatados % 1000 !== 0) {
    mostrarMensagem(msgEl, 'O valor deve ser múltiplo de 1.000 pontos.', 'error');
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
      estabelecimento:  agente,
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

    // Notifica todos os admins sobre novo resgate pendente
    await criarNotificacao({
      destinatarioRole: 'admin',
      tipo:     'novo_resgate',
      titulo:   'Nova solicitação de resgate',
      mensagem: `${resgateAtual.vetNome} solicitou ${pontosResgatados.toLocaleString('pt-BR')} pts (R$ ${valorReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
      metadata: { resgateId: docRef.id, vetUid: resgateAtual.vetUid, pontosResgatados, valorReais }
    });

    // Salva dados antes de fecharModalResgate() — que zera resgateAtual
    const { vetNome, vetCrmv, vetCpf } = resgateAtual;
    const cotacaoSnapshot = { pontosBase: dashCotacao.pontosBase, valorReais: dashCotacao.valorReais };
    fecharModalResgate();
    abrirComprovante({
      protocolo:    docRef.id,
      vetNome,
      vetCrmv,
      vetCpf,
      estabelecimento: agente,
      pontosResgatados,
      valorReais,
      cotacaoSnapshot,
      solicitadoEm: new Date(),
    });
  } catch (err) {
    console.error(err);
    mostrarMensagem(msgEl, 'Erro ao registrar resgate. Tente novamente.', 'error');
  } finally {
    pararLoading(btn);
  }
}

// ── FCM PUSH NOTIFICATIONS ───────────────────────────────────────────────────
async function configurarFCM(uid) {
  if (!FCM_VAPID_KEY) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) return;

    // Adiciona o token ao array sem duplicar e sem apagar tokens de outros dispositivos
    const userRef  = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const tokens   = userSnap.exists() ? (userSnap.data().fcmTokens || []) : [];
    if (!tokens.includes(token)) {
      await updateDoc(userRef, { fcmTokens: [...tokens, token] });
    }

    // Exibe notificações quando o app está em foreground
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      mostrarToastFCM(title, body);
    });

  } catch (err) {
    console.error('FCM:', err);
  }
}

function mostrarToastFCM(titulo, corpo) {
  const toast = document.createElement('div');
  toast.className = 'fcm-toast';
  toast.innerHTML = `
    <div class="fcm-toast__titulo">${esc(titulo || 'Notificação')}</div>
    ${corpo ? `<div class="fcm-toast__corpo">${esc(corpo)}</div>` : ''}
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('fcm-toast--visivel'), 50);
  setTimeout(() => {
    toast.classList.remove('fcm-toast--visivel');
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// ── SINO E DRAWER DE NOTIFICAÇÕES ────────────────────────────────────────────
let _unsubSino = null;  // listener onSnapshot do sino

function inicializarSino(uid, role) {
  // Encerra listener anterior se existir
  if (_unsubSino) { _unsubSino(); _unsubSino = null; }

  const q = query(
    collection(db, 'notificacoes'),
    where('destinatarioUid', '==', uid),
    orderBy('criadaEm', 'desc')
  );
  const qRole = query(
    collection(db, 'notificacoes'),
    where('destinatarioRole', '==', role),
    where('destinatarioUid', '==', null),
    orderBy('criadaEm', 'desc')
  );

  // Mantém cache local das notificações (por uid + por role)
  let notifPorUid  = [];
  let notifPorRole = [];

  function atualizar() {
    const todas = [...notifPorUid, ...notifPorRole]
      .sort((a, b) => {
        const ta = a.criadaEm?.seconds ?? 0;
        const tb = b.criadaEm?.seconds ?? 0;
        return tb - ta;
      })
      .slice(0, 20);
    atualizarBadgeSino(todas.filter(n => !n.lida).length);
    renderizarDrawer(todas);
  }

  const unsubUid = onSnapshot(q, snap => {
    notifPorUid = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    atualizar();
  }, err => console.error('sino uid:', err));

  const unsubRole = onSnapshot(qRole, snap => {
    notifPorRole = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    atualizar();
  }, err => console.error('sino role:', err));

  _unsubSino = () => { unsubUid(); unsubRole(); };
}

function atualizarBadgeSino(count) {
  document.querySelectorAll('.sino-badge').forEach(badge => {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
}

function renderizarDrawer(notifs) {
  const lista = document.getElementById('notif-lista');
  if (!lista) return;

  if (!notifs.length) {
    lista.innerHTML = '<div class="notif-vazia">Nenhuma notificação</div>';
    return;
  }

  lista.innerHTML = notifs.map(n => `
    <div class="notif-item${n.lida ? '' : ' notif-item--nao-lida'}" data-id="${esc(n._id)}">
      <div class="notif-item__icone">${iconePorTipo(n.tipo)}</div>
      <div class="notif-item__corpo">
        <div class="notif-item__titulo">${esc(n.titulo || '')}</div>
        <div class="notif-item__msg">${esc(n.mensagem || '')}</div>
        <div class="notif-item__tempo">${formatarTempoAtras(n.criadaEm)}</div>
      </div>
    </div>
  `).join('');
}

function iconePorTipo(tipo) {
  const mapa = {
    novo_cadastro:       '👤',
    cadastro_aprovado:   '✅',
    pontos_atualizados:  '⭐',
    novo_resgate:        '💰',
    resgate_finalizado:  '🎉',
  };
  return mapa[tipo] || '🔔';
}

function formatarTempoAtras(ts) {
  if (!ts) return '';
  const d   = ts.toDate ? ts.toDate() : new Date(ts);
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60)    return 'agora';
  if (seg < 3600)  return `${Math.floor(seg / 60)} min atrás`;
  if (seg < 86400) return `${Math.floor(seg / 3600)} h atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

async function marcarTodasLidas(ids) {
  if (!ids?.length) return;
  const batch = [];
  ids.forEach(id => {
    batch.push(updateDoc(doc(db, 'notificacoes', id), { lida: true }));
  });
  await Promise.all(batch).catch(err => console.error('marcarLidas:', err));
}

window.abrirDrawerNotif = function abrirDrawerNotif() {
  const drawer    = document.getElementById('notif-drawer');
  const backdrop  = document.getElementById('notif-backdrop');
  if (!drawer) return;
  drawer.classList.add('notif-drawer--aberto');
  backdrop.classList.add('notif-backdrop--visivel');

  // Marca como lidas as não lidas visíveis
  const naoLidas = [...document.querySelectorAll('.notif-item--nao-lida')];
  const ids = naoLidas.map(el => el.dataset.id).filter(Boolean);
  if (ids.length) setTimeout(() => marcarTodasLidas(ids), 600);
}

window.fecharDrawerNotif = function() {
  document.getElementById('notif-drawer')?.classList.remove('notif-drawer--aberto');
  document.getElementById('notif-backdrop')?.classList.remove('notif-backdrop--visivel');
};

// ── NOTIFICAÇÕES IN-APP ───────────────────────────────────────────────────────
// Grava um documento em /notificacoes.
// Se destinatarioUid for fornecido, notifica aquele usuário específico.
// Se apenas destinatarioRole, notifica todos da role via broadcast.
async function criarNotificacao({ destinatarioUid = null, destinatarioRole, tipo, titulo, mensagem, metadata = {} }) {
  try {
    await addDoc(collection(db, 'notificacoes'), {
      destinatarioUid,
      destinatarioRole,
      tipo,
      titulo,
      mensagem,
      lida: false,
      criadaEm: serverTimestamp(),
      metadata
    });
  } catch (err) {
    console.error('criarNotificacao:', err);
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
