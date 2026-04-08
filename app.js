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
getDoc
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

// ── CONFIG ───────────────────────────────────────
const firebaseConfig = {
apiKey: "AIzaSyCW2HG6ECzk6OD0cenYqY1R3rsJ1Oecgek",
authDomain: "biovet-parceiro-vet.firebaseapp.com",
projectId: "biovet-parceiro-vet",
storageBucket: "biovet-parceiro-vet.firebasestorage.app",
messagingSenderId: "549792200166",
appId: "1:549792200166:web:0cf14a3895227b79031227"
};
const APPS_SCRIPT_URL = '';

// ── FIREBASE ─────────────────────────────────────
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

let isRegistering = false;

// ── ELEMENTOS ────────────────────────────────────
const authView      = document.getElementById('auth-view');
const homeView      = document.getElementById('home-view');
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

// ── VIEWS ────────────────────────────────────────
// Nota: a navegação entre telas (botões da welcome, voltar,
// troca de forms) está no script inline do index.html para
// garantir que funcione mesmo se este módulo falhar ao carregar.

function mostrarAuthView(opcoes) {
  opcoes = opcoes || {};
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();

  homeView.classList.remove('active');
  authView.classList.add('active');

  // Sempre volta para welcome
  formsPanel.classList.add('hidden');
  welcomeScreen.style.display = '';

  // Limpa campos e mensagens
  loginEmailInput.value    = '';
  loginPasswordInput.value = '';
  limparMensagem(loginError);

  // Se vier com opções, abre direto no form com mensagem
  if (opcoes.form) {
    // Usa as funções globais do inline script
    if (typeof _navAbrirForms === 'function') {
      _navAbrirForms(opcoes.form);
    } else {
      // Fallback caso inline não tenha carregado
      welcomeScreen.style.display = 'none';
      formsPanel.classList.remove('hidden');
      [loginForm, registerForm, resetForm].forEach(function(f) {
        if (f) f.classList.add('hidden');
      });
      var alvo = document.getElementById(opcoes.form);
      if (alvo) alvo.classList.remove('hidden');
    }
    if (opcoes.elId && opcoes.mensagem) {
      var el = document.getElementById(opcoes.elId);
      if (el) mostrarMensagem(el, opcoes.mensagem, opcoes.tipo || 'error');
    }
  }

  window.scrollTo(0, 0);
}

function mostrarHomeView() {
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  authView.classList.remove('active');
  homeView.classList.add('active');
  window.scrollTo(0, 0);
}

// ── OBSERVADOR DE AUTENTICAÇÃO ───────────────────

onAuthStateChanged(auth, async (user) => {
  if (isRegistering) return;

  if (user) {
    if (window.showLoadingOverlay) window.showLoadingOverlay();

    try {
      const snap = await getDoc(doc(db, 'users', user.uid));

      if (!snap.exists()) {
        await signOut(auth);
        mostrarAuthView({
          form: 'login-form',
          elId: 'login-error',
          mensagem: 'Cadastro nao encontrado.',
          tipo: 'error'
        });
        return;
      }

      const data = snap.data();

      if (data.approved === true) {
        await carregarDadosHome(user, data);
        mostrarHomeView();
      } else {
        await signOut(auth);
        mostrarAuthView({
          form: 'login-form',
          elId: 'login-error',
          mensagem: 'Cadastro ainda nao aprovado. Aguarde o contato da equipe Biovetfarma.',
          tipo: 'error'
        });
      }
    } catch (err) {
      console.error(err);
      await signOut(auth);
      mostrarAuthView({
        form: 'login-form',
        elId: 'login-error',
        mensagem: 'Erro ao validar cadastro. Tente novamente.',
        tipo: 'error'
      });
    }

  } else {
    mostrarAuthView();
  }
});

// ── LOGIN ────────────────────────────────────────

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparMensagem(loginError);

  const email    = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    mostrarMensagem(loginError, 'Informe e-mail e senha.', 'error');
    return;
  }

  const btn = loginForm.querySelector('button[type="submit"]');
  iniciarLoading(btn);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged cuida do redirecionamento
  } catch (err) {
    console.error(err);
    mostrarMensagem(loginError, traduzErro(err.code), 'error');
    pararLoading(btn);
  }
});

// ── CADASTRO ─────────────────────────────────────

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparMensagem(registerError);

  const nome           = registerNameInput.value.trim();
  const cpf            = registerCpfInput.value.trim();
  const dataNascimento = registerDobInput.value;
  const crmv           = registerCrmvInput.value.trim();
  const email          = registerEmailInput.value.trim();
  const senha          = registerPasswordInput.value;
  const senhaConf      = registerPasswordConfirmInput.value;

  if (!nome || !cpf || !dataNascimento || !crmv || !email || !senha || !senhaConf) {
    mostrarMensagem(registerError, 'Preencha todos os campos.', 'error');
    return;
  }

  if (senha !== senhaConf) {
    mostrarMensagem(registerError, 'As senhas nao conferem.', 'error');
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
      approved: false
    });

    if (APPS_SCRIPT_URL) {
      fetch(`${APPS_SCRIPT_URL}?acao=cadastro&crmv=${encodeURIComponent(crmv)}&nome=${encodeURIComponent(nome)}`)
        .catch(err => console.error('Apps Script:', err));
    }

    await new Promise(r => setTimeout(r, 400));
    await signOut(auth);
    registerForm.reset();

    mostrarAuthView({
      form: 'login-form',
      elId: 'login-error',
      mensagem: 'Cadastro realizado! Aguarde aprovacao para acessar.',
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

// ── RESET DE SENHA ───────────────────────────────

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

// ── LOGOUT ───────────────────────────────────────

logoutBtn?.addEventListener('click', () => signOut(auth));

// ── DADOS DA HOME ────────────────────────────────

async function carregarDadosHome(user, data) {
  const nome   = data?.nome   || user.displayName || user.email?.split('@')[0] || 'Parceiro';
  const crmv   = data?.crmv   || '—';
  const pontos = typeof data?.pontos === 'number' ? data.pontos : 0;

  if (userNameSpan)   userNameSpan.textContent  = nome;
  if (cardUserNameEl) cardUserNameEl.textContent = nome;
  if (cardUserCrmvEl) cardUserCrmvEl.textContent = crmv;

  animarContador(pointsValueEl, 0, pontos, 1200);

  const msg = encodeURIComponent(`Ola, sou o(a) Dr(a). ${nome} e gostaria de trocar minhas Biovet Milhas.`);
  if (whatsappLink) whatsappLink.href = `https://wa.me/5514997132879?text=${msg}`;
}

// ── CONTADOR ANIMADO ─────────────────────────────

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

// ── UTILITÁRIOS DE UI ────────────────────────────

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

// ── ERROS FIREBASE ───────────────────────────────

function traduzErro(code) {
  const mapa = {
    'auth/invalid-email':        'E-mail invalido.',
    'auth/user-disabled':        'Usuario desativado.',
    'auth/user-not-found':       'E-mail nao cadastrado.',
    'auth/wrong-password':       'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail ja cadastrado.',
    'auth/weak-password':        'Senha fraca. Use pelo menos 6 caracteres.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
    'auth/too-many-requests':    'Muitas tentativas. Aguarde alguns minutos.',
  };
  return mapa[code] || 'Ocorreu um erro. Tente novamente.';
}

// ── SERVICE WORKER ───────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .catch(err => console.error('SW:', err));
  });
}
