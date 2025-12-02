// Importes do Firebase (SDK modular via CDN)
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

// =========================================
// CONFIGURAÇÕES – EDITE AQUI
// =========================================

const firebaseConfig = {
  apiKey: 'SUA_API_KEY',
  authDomain: 'SEU_PROJETO.firebaseapp.com',
  projectId: 'SEU_PROJETO'
};

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/SUA_URL_WEBAPP/exec';

// =========================================
// INICIALIZAÇÃO FIREBASE
// =========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =========================================
// ELEMENTOS DE TELA
// =========================================

const authView = document.getElementById('auth-view');
const homeView = document.getElementById('home-view');

const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

const registerForm = document.getElementById('register-form');
const registerNameInput = document.getElementById('register-name');
const registerCpfInput = document.getElementById('register-cpf');
const registerDobInput = document.getElementById('register-dob');
const registerCrmvInput = document.getElementById('register-crmv');
const registerEmailInput = document.getElementById('register-email');
const registerPasswordInput = document.getElementById('register-password');
const registerPasswordConfirmInput = document.getElementById('register-password-confirm');
const registerError = document.getElementById('register-error');

const resetForm = document.getElementById('reset-form');
const resetEmailInput = document.getElementById('reset-email');
const resetInfo = document.getElementById('reset-info');

const showResetBtn = document.getElementById('show-reset');
const showRegisterBtn = document.getElementById('show-register');
const showLoginFromRegisterBtn = document.getElementById('show-login-from-register');
const showLoginFromResetBtn = document.getElementById('show-login-from-reset');

const logoutBtn = document.getElementById('logout-btn');
const userNameSpan = document.getElementById('user-name');
const pointsValueEl = document.getElementById('points-value');
const whatsappLink = document.getElementById('whatsapp-link');

// =========================================
// TROCA DE VIEWS (LOGIN / HOME)
// =========================================

function showAuthView() {
  authView.classList.add('active');
  homeView.classList.remove('active');
}

function showHomeView() {
  homeView.classList.add('active');
  authView.classList.remove('active');
}

function showLoginForm() {
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  resetForm.classList.add('hidden');
  loginError.textContent = '';
}

function showRegisterForm() {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  resetForm.classList.add('hidden');
  registerError.textContent = '';
}

function showResetForm() {
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  resetForm.classList.remove('hidden');
  resetInfo.textContent = '';
}

// =========================================
// LISTENERS DE BOTOES DE TROCA
// =========================================

showResetBtn.addEventListener('click', showResetForm);
showRegisterBtn.addEventListener('click', showRegisterForm);
showLoginFromRegisterBtn.addEventListener('click', showLoginForm);
showLoginFromResetBtn.addEventListener('click', showLoginForm);

// =========================================
// LOGIN
// =========================================

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    loginError.textContent = 'Informe e-mail e senha.';
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    loginError.textContent = traduzErroAuth(error.code);
  }
});

// =========================================
// CADASTRO
// =========================================

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';

  const nome = registerNameInput.value.trim();
  const cpf = registerCpfInput.value.trim();
  const dataNascimento = registerDobInput.value;
  const crmv = registerCrmvInput.value.trim();
  const email = registerEmailInput.value.trim();
  const senha = registerPasswordInput.value;
  const senhaConf = registerPasswordConfirmInput.value;

  if (!nome || !cpf || !dataNascimento || !crmv || !email || !senha || !senhaConf) {
    registerError.textContent = 'Preencha todos os campos.';
    return;
  }

  if (senha !== senhaConf) {
    registerError.textContent = 'As senhas não conferem.';
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);

    await updateProfile(cred.user, { displayName: nome });

    await setDoc(doc(db, 'users', cred.user.uid), {
      nome,
      cpf,
      dataNascimento,
      crmv,
      email
    });
  } catch (error) {
    console.error(error);
    registerError.textContent = traduzErroAuth(error.code);
  }
});

// =========================================
// RESET DE SENHA
// =========================================

resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetInfo.textContent = '';

  const email = resetEmailInput.value.trim();
  if (!email) {
    resetInfo.textContent = 'Informe o e-mail cadastrado.';
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    resetInfo.style.color = '#1a7175';
    resetInfo.textContent = 'Link de redefinição enviado para o seu e-mail.';
  } catch (error) {
    console.error(error);
    resetInfo.style.color = '#c0392b';
    resetInfo.textContent = traduzErroAuth(error.code);
  }
});

// =========================================
// LOGOUT
// =========================================

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

// =========================================
// OBSERVADOR DE AUTENTICAÇÃO
// =========================================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    showHomeView();
    await carregarDadosHome(user);
  } else {
    showAuthView();
    showLoginForm();
  }
});

// =========================================
// CARREGAR NOME E PONTOS DA HOME
// =========================================

async function carregarDadosHome(user) {
  try {
    let nome = user.displayName || '';
    let crmv = '';

    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      if (!nome && data.nome) {
        nome = data.nome;
      }
      if (data.crmv) {
        crmv = data.crmv;
      }
    }

    if (!nome) {
      if (user.email) {
        nome = user.email.split('@')[0];
      } else {
        nome = 'Parceiro';
      }
    }

    userNameSpan.textContent = nome;

    const mensagem = encodeURIComponent(
      `Olá, sou o(a) Dr(a). ${nome} e gostaria de trocar minhas Biovet Milhas.`
    );
    whatsappLink.href = `https://wa.me/5514997132879?text=${mensagem}`;

    if (!crmv) {
      pointsValueEl.textContent = 'Cadastre seu CRMV para visualizar os pontos.';
      return;
    }

    pointsValueEl.textContent = 'Carregando...';

    const res = await fetch(`${APPS_SCRIPT_URL}?crmv=${encodeURIComponent(crmv)}`);
    if (!res.ok) {
      throw new Error('Erro ao buscar pontos.');
    }
    const data = await res.json();

    if (data && data.success) {
      pointsValueEl.textContent = `${data.pontos} pontos`;
    } else {
      pointsValueEl.textContent = '0 pontos';
    }
  } catch (error) {
    console.error(error);
    pointsValueEl.textContent = 'Não foi possível carregar seus pontos.';
  }
}

// =========================================
// TRADUÇÃO SIMPLES DE ERROS DE AUTH
// =========================================

function traduzErroAuth(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/user-disabled':
      return 'Usuário desativado.';
    case 'auth/user-not-found':
      return 'Usuário não encontrado.';
    case 'auth/wrong-password':
      return 'Senha incorreta.';
    case 'auth/email-already-in-use':
      return 'E-mail já cadastrado.';
    case 'auth/weak-password':
      return 'Senha muito fraca. Use pelo menos 6 caracteres.';
    default:
      return 'Ocorreu um erro. Tente novamente.';
  }
}

// =========================================
// SERVICE WORKER – PWA
// =========================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .catch((err) => console.error('Erro ao registrar Service Worker', err));
  });
}
