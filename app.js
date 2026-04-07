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

const APPS_SCRIPT_URL = ‘’; // substitua pela sua URL do Apps Script se necessário

// =========================================
// INICIALIZAÇÃO FIREBASE
// =========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let isRegistering = false;

// =========================================
// ELEMENTOS DE TELA
// =========================================

const authView    = document.getElementById(‘auth-view’);
const homeView    = document.getElementById(‘home-view’);

const welcomeScreen = document.getElementById(‘welcome-screen’);
const formsPanel    = document.getElementById(‘forms-panel’);

const loginForm    = document.getElementById(‘login-form’);
const loginEmailInput    = document.getElementById(‘login-email’);
const loginPasswordInput = document.getElementById(‘login-password’);
const loginError         = document.getElementById(‘login-error’);

const registerForm                = document.getElementById(‘register-form’);
const registerNameInput           = document.getElementById(‘register-name’);
const registerCpfInput            = document.getElementById(‘register-cpf’);
const registerDobInput            = document.getElementById(‘register-dob’);
const registerCrmvInput           = document.getElementById(‘register-crmv’);
const registerEmailInput          = document.getElementById(‘register-email’);
const registerPasswordInput       = document.getElementById(‘register-password’);
const registerPasswordConfirmInput= document.getElementById(‘register-password-confirm’);
const registerError               = document.getElementById(‘register-error’);

const resetForm      = document.getElementById(‘reset-form’);
const resetEmailInput= document.getElementById(‘reset-email’);
const resetInfo      = document.getElementById(‘reset-info’);

const showResetBtn              = document.getElementById(‘show-reset’);
const showRegisterBtn           = document.getElementById(‘show-register’);
const showLoginFromRegisterBtn  = document.getElementById(‘show-login-from-register’);
const showLoginFromResetBtn     = document.getElementById(‘show-login-from-reset’);

const logoutBtn       = document.getElementById(‘logout-btn’);
const userNameSpan    = document.getElementById(‘user-name’);
const pointsValueEl   = document.getElementById(‘points-value’);
const whatsappLink    = document.getElementById(‘whatsapp-link’);
const cardUserNameEl  = document.getElementById(‘card-user-name’);
const cardUserCrmvEl  = document.getElementById(‘card-user-crmv’);

// =========================================
// HELPERS DE NAVEGAÇÃO ENTRE FORMULÁRIOS
// =========================================

function openFormsPanel(targetFormId) {
// Esconde welcome, mostra forms
if (welcomeScreen && !welcomeScreen.classList.contains(‘hidden’)) {
welcomeScreen.classList.add(‘panel–slide-out’);
setTimeout(() => welcomeScreen.classList.add(‘hidden’), 320);
}

if (formsPanel) {
formsPanel.classList.remove(‘hidden’);
formsPanel.classList.add(‘panel–slide-in’);
setTimeout(() => formsPanel.classList.remove(‘panel–slide-in’), 320);
}

showForm(targetFormId);
}

function showForm(id) {
[loginForm, registerForm, resetForm].forEach(f => {
if (f) f.classList.add(‘hidden’);
});
const target = document.getElementById(id);
if (target) target.classList.remove(‘hidden’);
}

// =========================================
// TROCA DE VIEWS (AUTH / HOME)
// =========================================

function showAuthView() {
if (window.hideLoadingOverlay) window.hideLoadingOverlay();
authView.classList.add(‘active’);
homeView.classList.remove(‘active’);

// Volta para a tela de boas-vindas
if (formsPanel)    formsPanel.classList.add(‘hidden’);
if (welcomeScreen) welcomeScreen.classList.remove(‘hidden’, ‘panel–slide-out’);

loginEmailInput.value    = ‘’;
loginPasswordInput.value = ‘’;
}

function showHomeView() {
if (window.hideLoadingOverlay) window.hideLoadingOverlay();
homeView.classList.add(‘active’);
authView.classList.remove(‘active’);
}

// =========================================
// LISTENERS DE NAVEGAÇÃO NOS FORMS
// =========================================

showResetBtn?.addEventListener(‘click’, () => showForm(‘reset-form’));
showRegisterBtn?.addEventListener(‘click’, () => showForm(‘register-form’));
showLoginFromRegisterBtn?.addEventListener(‘click’, () => showForm(‘login-form’));
showLoginFromResetBtn?.addEventListener(‘click’, () => showForm(‘login-form’));

// Botões da tela de boas-vindas (já tratados no HTML inline, mas garantindo aqui)
document.getElementById(‘btn-go-login’)?.addEventListener(‘click’, () => openFormsPanel(‘login-form’));
document.getElementById(‘btn-go-register’)?.addEventListener(‘click’, () => openFormsPanel(‘register-form’));

// =========================================
// LOGIN
// =========================================

loginForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
loginError.textContent = ‘’;

const email    = loginEmailInput.value.trim();
const password = loginPasswordInput.value;

if (!email || !password) {
showError(loginError, ‘Informe e-mail e senha.’);
return;
}

const btn = loginForm.querySelector(‘button[type=“submit”]’);
setLoading(btn, true);

try {
await signInWithEmailAndPassword(auth, email, password);
} catch (error) {
console.error(error);
showError(loginError, traduzErro(error.code));
setLoading(btn, false);
}
});

// =========================================
// CADASTRO
// =========================================

registerForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
registerError.textContent = ‘’;

const nome          = registerNameInput.value.trim();
const cpf           = registerCpfInput.value.trim();
const dataNascimento= registerDobInput.value;
const crmv          = registerCrmvInput.value.trim();
const email         = registerEmailInput.value.trim();
const senha         = registerPasswordInput.value;
const senhaConf     = registerPasswordConfirmInput.value;

if (!nome || !cpf || !dataNascimento || !crmv || !email || !senha || !senhaConf) {
showError(registerError, ‘Preencha todos os campos.’);
return;
}

if (senha !== senhaConf) {
showError(registerError, ‘As senhas não conferem.’);
return;
}

const btn = registerForm.querySelector(‘button[type=“submit”]’);
setLoading(btn, true);

try {
isRegistering = true;

```
const cred = await createUserWithEmailAndPassword(auth, email, senha);
await updateProfile(cred.user, { displayName: nome });

await setDoc(doc(db, 'users', cred.user.uid), {
  nome,
  cpf,
  dataNascimento,
  crmv,
  email,
  pontos: 0,
  approved: false
});

if (APPS_SCRIPT_URL) {
  try {
    await fetch(`${APPS_SCRIPT_URL}?acao=cadastro&crmv=${encodeURIComponent(crmv)}&nome=${encodeURIComponent(nome)}`);
  } catch (err) {
    console.error('Erro ao criar linha na planilha:', err);
  }
}

await new Promise(r => setTimeout(r, 500));
await signOut(auth);

showAuthView();
// Abre login com mensagem de sucesso
openFormsPanel('login-form');
loginError.textContent = '✅ Cadastro realizado! Aguarde aprovação para acessar.';
loginError.style.color = '#1A7175';
loginError.style.background = '#e8f8f5';
loginError.style.padding = '10px 14px';
loginError.style.borderRadius = '10px';
registerForm.reset();
```

} catch (error) {
console.error(‘Erro no cadastro:’, error);
showError(registerError, traduzErro(error.code));
} finally {
isRegistering = false;
setLoading(btn, false);
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
showError(resetInfo, ‘Informe o e-mail cadastrado.’);
return;
}

const btn = resetForm.querySelector(‘button[type=“submit”]’);
setLoading(btn, true);

try {
await sendPasswordResetEmail(auth, email);
resetInfo.textContent = ‘✅ Link enviado! Verifique seu e-mail.’;
resetInfo.style.color = ‘#1A7175’;
resetInfo.style.background = ‘#e8f8f5’;
resetInfo.style.padding = ‘10px 14px’;
resetInfo.style.borderRadius = ‘10px’;
} catch (error) {
console.error(error);
showError(resetInfo, traduzErro(error.code));
} finally {
setLoading(btn, false);
}
});

// =========================================
// LOGOUT
// =========================================

logoutBtn?.addEventListener(‘click’, async () => {
await signOut(auth);
});

// =========================================
// OBSERVADOR DE AUTENTICAÇÃO
// =========================================

onAuthStateChanged(auth, async (user) => {
if (isRegistering) return;

if (user) {
if (window.showLoadingOverlay) window.showLoadingOverlay();
try {
const userDocRef  = doc(db, ‘users’, user.uid);
const userDocSnap = await getDoc(userDocRef);

```
  if (!userDocSnap.exists()) {
    await signOut(auth);
    showAuthView();
    openFormsPanel('login-form');
    showError(loginError, 'Cadastro não encontrado.');
    return;
  }

  const data = userDocSnap.data();

  if (data.approved === true) {
    await carregarDadosHome(user, data);
    showHomeView();
  } else {
    await signOut(auth);
    showAuthView();
    openFormsPanel('login-form');
    showError(loginError, 'Seu cadastro ainda não foi aprovado. Aguarde o contato da equipe Biovetfarma.');
  }
} catch (error) {
  console.error(error);
  await signOut(auth);
  showAuthView();
  showError(loginError, 'Erro ao validar cadastro. Tente novamente.');
}
```

} else {
showAuthView();
}
});

// =========================================
// CARREGAR DADOS DA HOME
// =========================================

async function carregarDadosHome(user, cachedData) {
try {
let data = cachedData;

```
if (!data) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  data = snap.exists() ? snap.data() : {};
}

const nome   = data.nome || user.displayName || user.email?.split('@')[0] || 'Parceiro';
const crmv   = data.crmv || '---';
const pontos = typeof data.pontos === 'number' ? data.pontos : 0;

if (userNameSpan)   userNameSpan.textContent  = nome;
if (cardUserNameEl) cardUserNameEl.textContent = nome;
if (cardUserCrmvEl) cardUserCrmvEl.textContent = crmv;

// Animação do contador de pontos
animateCounter(pointsValueEl, 0, pontos, 1000);

const mensagem = encodeURIComponent(`Olá, sou o(a) Dr(a). ${nome} e gostaria de trocar minhas Biovet Milhas.`);
if (whatsappLink) whatsappLink.href = `https://wa.me/5514997132879?text=${mensagem}`;
```

} catch (error) {
console.error(error);
if (pointsValueEl) pointsValueEl.textContent = ‘—’;
}
}

// =========================================
// ANIMAÇÃO DO CONTADOR DE PONTOS
// =========================================

function animateCounter(el, from, to, duration) {
if (!el) return;
if (to === 0) { el.textContent = ‘0’; return; }

const start    = performance.now();
const diff     = to - from;

function step(now) {
const elapsed  = now - start;
const progress = Math.min(elapsed / duration, 1);
const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
el.textContent = Math.round(from + diff * eased).toLocaleString(‘pt-BR’);
if (progress < 1) requestAnimationFrame(step);
}

requestAnimationFrame(step);
}

// =========================================
// UTILITÁRIOS
// =========================================

function showError(el, msg) {
if (!el) return;
el.textContent = msg;
el.classList.add(‘form-msg–error’);
// Micro-animação de shake
el.style.animation = ‘none’;
el.offsetHeight; // reflow
el.style.animation = ‘shake 0.35s ease’;
}

function setLoading(btn, loading) {
if (!btn) return;
btn.disabled = loading;
btn.style.opacity = loading ? ‘0.7’ : ‘1’;
btn.textContent = loading ? ‘Aguarde…’ : btn.dataset.label || btn.textContent;
}

// Salvar label original dos botões
document.querySelectorAll(’.btn[type=“submit”]’).forEach(btn => {
btn.dataset.label = btn.textContent;
});

// =========================================
// ANIMAÇÃO SHAKE (injetar no CSS dinamicamente)
// =========================================

const shakeStyle = document.createElement(‘style’);
shakeStyle.textContent = `@keyframes shake { 0%, 100% { transform: translateX(0); } 20%       { transform: translateX(-6px); } 40%       { transform: translateX(6px); } 60%       { transform: translateX(-4px); } 80%       { transform: translateX(4px); } }`;
document.head.appendChild(shakeStyle);

// =========================================
// TRADUÇÃO DE ERROS FIREBASE
// =========================================

function traduzErro(code) {
const erros = {
‘auth/invalid-email’:        ‘E-mail inválido.’,
‘auth/user-disabled’:        ‘Usuário desativado.’,
‘auth/user-not-found’:       ‘E-mail não cadastrado.’,
‘auth/wrong-password’:       ‘Senha incorreta.’,
‘auth/email-already-in-use’: ‘E-mail já cadastrado.’,
‘auth/weak-password’:        ‘Senha fraca. Use pelo menos 6 caracteres.’,
‘auth/invalid-credential’:   ‘E-mail ou senha incorretos.’,
‘auth/too-many-requests’:    ‘Muitas tentativas. Aguarde alguns minutos.’,
‘permission-denied’:         ‘Sem permissão de acesso.’,
};
return erros[code] || ‘Ocorreu um erro. Tente novamente.’;
}

// =========================================
// SERVICE WORKER
// =========================================

if (‘serviceWorker’ in navigator) {
window.addEventListener(‘load’, () => {
navigator.serviceWorker
.register(‘service-worker.js’)
.catch(err => console.error(‘Service Worker error:’, err));
});
}