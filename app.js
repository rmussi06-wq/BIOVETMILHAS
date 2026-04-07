// Importes do Firebase (SDK modular via CDN)
import { initializeApp } from ‘https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js’;
import {
getAuth,
onAuthStateChanged,
signInWithEmailAndPassword,
createUserWithEmailAndPassword,
sendPasswordResetEmail,
signOut,
updateProfile
} from ‘https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js’;
import {
getFirestore,
doc,
setDoc,
getDoc
} from ‘https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js’;

// =========================================
// CONFIGURAÇÕES
// =========================================

const firebaseConfig = {
apiKey: “AIzaSyCW2HG6ECzk6OD0cenYqY1R3rsJ1Oecgek”,
authDomain: “biovet-parceiro-vet.firebaseapp.com”,
projectId: “biovet-parceiro-vet”,
storageBucket: “biovet-parceiro-vet.firebasestorage.app”,
messagingSenderId: “549792200166”,
appId: “1:549792200166:web:0cf14a3895227b79031227”
};

const APPS_SCRIPT_URL = ‘’;

// =========================================
// INICIALIZAÇÃO FIREBASE
// =========================================

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let isRegistering = false;

// =========================================
// ELEMENTOS
// =========================================

const authView      = document.getElementById(‘auth-view’);
const homeView      = document.getElementById(‘home-view’);
const welcomeScreen = document.getElementById(‘welcome-screen’);
const formsPanel    = document.getElementById(‘forms-panel’);

const loginForm              = document.getElementById(‘login-form’);
const loginEmailInput        = document.getElementById(‘login-email’);
const loginPasswordInput     = document.getElementById(‘login-password’);
const loginError             = document.getElementById(‘login-error’);

const registerForm                 = document.getElementById(‘register-form’);
const registerNameInput            = document.getElementById(‘register-name’);
const registerCpfInput             = document.getElementById(‘register-cpf’);
const registerDobInput             = document.getElementById(‘register-dob’);
const registerCrmvInput            = document.getElementById(‘register-crmv’);
const registerEmailInput           = document.getElementById(‘register-email’);
const registerPasswordInput        = document.getElementById(‘register-password’);
const registerPasswordConfirmInput = document.getElementById(‘register-password-confirm’);
const registerError                = document.getElementById(‘register-error’);

const resetForm       = document.getElementById(‘reset-form’);
const resetEmailInput = document.getElementById(‘reset-email’);
const resetInfo       = document.getElementById(‘reset-info’);

const logoutBtn      = document.getElementById(‘logout-btn’);
const userNameSpan   = document.getElementById(‘user-name’);
const pointsValueEl  = document.getElementById(‘points-value’);
const whatsappLink   = document.getElementById(‘whatsapp-link’);
const cardUserNameEl = document.getElementById(‘card-user-name’);
const cardUserCrmvEl = document.getElementById(‘card-user-crmv’);

// =========================================
// NAVEGAÇÃO ENTRE PAINÉIS
// =========================================

function abrirForms(formId) {
welcomeScreen.style.display = ‘none’;
formsPanel.classList.remove(‘hidden’);
mostrarForm(formId);
}

function voltarParaWelcome() {
formsPanel.classList.add(‘hidden’);
welcomeScreen.style.display = ‘’;
loginError.textContent = ‘’;
}

function mostrarForm(id) {
[loginForm, registerForm, resetForm].forEach(f => {
if (f) f.classList.add(‘hidden’);
});
const alvo = document.getElementById(id);
if (alvo) alvo.classList.remove(‘hidden’);
}

// Botões da welcome screen
document.getElementById(‘btn-go-login’)?.addEventListener(‘click’, () => abrirForms(‘login-form’));
document.getElementById(‘btn-go-register’)?.addEventListener(‘click’, () => abrirForms(‘register-form’));

// Botão voltar
document.getElementById(‘back-to-welcome’)?.addEventListener(‘click’, voltarParaWelcome);

// Troca entre forms
document.getElementById(‘show-reset’)?.addEventListener(‘click’, () => mostrarForm(‘reset-form’));
document.getElementById(‘show-register’)?.addEventListener(‘click’, () => mostrarForm(‘register-form’));
document.getElementById(‘show-login-from-register’)?.addEventListener(‘click’, () => mostrarForm(‘login-form’));
document.getElementById(‘show-login-from-reset’)?.addEventListener(‘click’, () => mostrarForm(‘login-form’));

// =========================================
// TROCA DE VIEWS (AUTH / HOME)
// =========================================

function mostrarAuthView(opcoes = {}) {
if (window.hideLoadingOverlay) window.hideLoadingOverlay();

homeView.classList.remove(‘active’);
authView.classList.add(‘active’);

// Sempre volta para welcome ao chamar sem opções
formsPanel.classList.add(‘hidden’);
welcomeScreen.style.display = ‘’;

loginEmailInput.value    = ‘’;
loginPasswordInput.value = ‘’;
loginError.textContent   = ‘’;

if (opcoes.form) {
abrirForms(opcoes.form);
if (opcoes.mensagem && opcoes.alvo) {
const el = document.getElementById(opcoes.alvo);
if (el) {
el.textContent = opcoes.mensagem;
el.className   = opcoes.classe || ‘form-msg’;
}
}
}
}

function mostrarHomeView() {
if (window.hideLoadingOverlay) window.hideLoadingOverlay();
authView.classList.remove(‘active’);
homeView.classList.add(‘active’);
}

// =========================================
// OBSERVADOR DE AUTENTICAÇÃO
// =========================================

onAuthStateChanged(auth, async (user) => {
if (isRegistering) return;

if (user) {
if (window.showLoadingOverlay) window.showLoadingOverlay();

```
try {
  const snap = await getDoc(doc(db, 'users', user.uid));

  if (!snap.exists()) {
    await signOut(auth);
    mostrarAuthView({
      form: 'login-form',
      alvo: 'login-error',
      mensagem: 'Cadastro não encontrado.',
      classe: 'form-msg form-msg--error'
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
      alvo: 'login-error',
      mensagem: 'Seu cadastro ainda não foi aprovado. Aguarde o contato da equipe Biovetfarma.',
      classe: 'form-msg form-msg--error'
    });
  }
} catch (err) {
  console.error(err);
  await signOut(auth);
  mostrarAuthView({
    form: 'login-form',
    alvo: 'login-error',
    mensagem: 'Erro ao validar cadastro. Tente novamente.',
    classe: 'form-msg form-msg--error'
  });
}
```

} else {
mostrarAuthView();
}
});

// =========================================
// LOGIN
// =========================================

loginForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
loginError.textContent = ‘’;

const email    = loginEmailInput.value.trim();
const password = loginPasswordInput.value;

if (!email || !password) {
exibirErro(loginError, ‘Informe e-mail e senha.’);
return;
}

const btn = loginForm.querySelector(‘button[type=“submit”]’);
iniciarLoading(btn);

try {
await signInWithEmailAndPassword(auth, email, password);
// onAuthStateChanged cuida do redirecionamento
} catch (err) {
console.error(err);
exibirErro(loginError, traduzErro(err.code));
pararLoading(btn);
}
});

// =========================================
// CADASTRO
// =========================================

registerForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
registerError.textContent = ‘’;

const nome           = registerNameInput.value.trim();
const cpf            = registerCpfInput.value.trim();
const dataNascimento = registerDobInput.value;
const crmv           = registerCrmvInput.value.trim();
const email          = registerEmailInput.value.trim();
const senha          = registerPasswordInput.value;
const senhaConf      = registerPasswordConfirmInput.value;

if (!nome || !cpf || !dataNascimento || !crmv || !email || !senha || !senhaConf) {
exibirErro(registerError, ‘Preencha todos os campos.’);
return;
}

if (senha !== senhaConf) {
exibirErro(registerError, ‘As senhas não conferem.’);
return;
}

const btn = registerForm.querySelector(‘button[type=“submit”]’);
iniciarLoading(btn);

try {
isRegistering = true;

```
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
  alvo: 'login-error',
  mensagem: '✅ Cadastro realizado! Aguarde aprovação para acessar.',
  classe: 'form-msg form-msg--success'
});
```

} catch (err) {
console.error(‘Erro no cadastro:’, err);
exibirErro(registerError, traduzErro(err.code));
} finally {
isRegistering = false;
pararLoading(btn);
}
});

// =========================================
// RESET DE SENHA
// =========================================

resetForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
resetInfo.textContent = ‘’;

const email = resetEmailInput.value.trim();
if (!email) {
exibirErro(resetInfo, ‘Informe o e-mail cadastrado.’);
return;
}

const btn = resetForm.querySelector(‘button[type=“submit”]’);
iniciarLoading(btn);

try {
await sendPasswordResetEmail(auth, email);
resetInfo.textContent = ‘✅ Link enviado! Verifique seu e-mail.’;
resetInfo.className   = ‘form-msg form-msg–success’;
} catch (err) {
console.error(err);
exibirErro(resetInfo, traduzErro(err.code));
} finally {
pararLoading(btn);
}
});

// =========================================
// LOGOUT
// =========================================

logoutBtn?.addEventListener(‘click’, async () => {
await signOut(auth);
});

// =========================================
// CARREGAR DADOS DA HOME
// =========================================

async function carregarDadosHome(user, data) {
const nome   = data?.nome   || user.displayName || user.email?.split(’@’)[0] || ‘Parceiro’;
const crmv   = data?.crmv   || ‘—’;
const pontos = typeof data?.pontos === ‘number’ ? data.pontos : 0;

if (userNameSpan)   userNameSpan.textContent  = nome;
if (cardUserNameEl) cardUserNameEl.textContent = nome;
if (cardUserCrmvEl) cardUserCrmvEl.textContent = crmv;

animarContador(pointsValueEl, 0, pontos, 1200);

const msg = encodeURIComponent(`Olá, sou o(a) Dr(a). ${nome} e gostaria de trocar minhas Biovet Milhas.`);
if (whatsappLink) whatsappLink.href = `https://wa.me/5514997132879?text=${msg}`;
}

// =========================================
// CONTADOR ANIMADO DE PONTOS
// =========================================

function animarContador(el, de, para, duracao) {
if (!el) return;
if (para === 0) { el.textContent = ‘0’; return; }

const inicio = performance.now();
const diff   = para - de;

function passo(agora) {
const p = Math.min((agora - inicio) / duracao, 1);
const s = 1 - Math.pow(1 - p, 3);
el.textContent = Math.round(de + diff * s).toLocaleString(‘pt-BR’);
if (p < 1) requestAnimationFrame(passo);
}

requestAnimationFrame(passo);
}

// =========================================
// UTILITÁRIOS DE UI
// =========================================

function exibirErro(el, msg) {
if (!el) return;
el.textContent     = msg;
el.className       = ‘form-msg form-msg–error’;
el.style.animation = ‘none’;
void el.offsetHeight;
el.style.animation = ‘shake 0.35s ease’;
}

function iniciarLoading(btn) {
if (!btn) return;
btn.disabled         = true;
btn.dataset.original = btn.textContent;
btn.textContent      = ‘Aguarde…’;
btn.style.opacity    = ‘0.7’;
}

function pararLoading(btn) {
if (!btn) return;
btn.disabled      = false;
btn.textContent   = btn.dataset.original || btn.textContent;
btn.style.opacity = ‘1’;
}

// Toggle senha
document.querySelectorAll(’.btn-eye’).forEach(btn => {
btn.addEventListener(‘click’, () => {
const input = document.getElementById(btn.dataset.target);
if (!input) return;
input.type = input.type === ‘password’ ? ‘text’ : ‘password’;
btn.classList.toggle(‘active’);
});
});

// CSS da animação shake e success
const style = document.createElement(‘style’);
style.textContent = `@keyframes shake { 0%,100% { transform: translateX(0); } 20%      { transform: translateX(-6px); } 40%      { transform: translateX(6px); } 60%      { transform: translateX(-4px); } 80%      { transform: translateX(4px); } } .form-msg--success { background: #e6f9ee !important; color: #1a7d3a !important; padding: 10px 14px; border-radius: 10px; }`;
document.head.appendChild(style);

// =========================================
// TRADUÇÃO DE ERROS FIREBASE
// =========================================

function traduzErro(code) {
const mapa = {
‘auth/invalid-email’:        ‘E-mail inválido.’,
‘auth/user-disabled’:        ‘Usuário desativado.’,
‘auth/user-not-found’:       ‘E-mail não cadastrado.’,
‘auth/wrong-password’:       ‘Senha incorreta.’,
‘auth/email-already-in-use’: ‘E-mail já cadastrado.’,
‘auth/weak-password’:        ‘Senha fraca. Use pelo menos 6 caracteres.’,
‘auth/invalid-credential’:   ‘E-mail ou senha incorretos.’,
‘auth/too-many-requests’:    ‘Muitas tentativas. Aguarde alguns minutos.’,
};
return mapa[code] || ‘Ocorreu um erro. Tente novamente.’;
}

// =========================================
// SERVICE WORKER
// =========================================

if (‘serviceWorker’ in navigator) {
window.addEventListener(‘load’, () => {
navigator.serviceWorker
.register(‘service-worker.js’)
.catch(err => console.error(‘Service Worker:’, err));
});
}