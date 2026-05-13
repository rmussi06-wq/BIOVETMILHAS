# CLAUDE.md — Projeto Biovet Pontos

> Documento de contexto, análise técnica e roadmap de evolução do PWA **Biovet Pontos** (programa de fidelidade da Biovetfarma para veterinários).
> Este arquivo é a fonte única de verdade do projeto. Mantenha-o atualizado a cada entrega.

---

## Índice

- [Parte I — Contexto do projeto](#parte-i--contexto-do-projeto)
- [Parte II — Análise técnica](#parte-ii--análise-técnica)
- [Parte III — Roadmap de evolução](#parte-iii--roadmap-de-evolução)
- [Parte IV — Pendências consolidadas](#parte-iv--pendências-consolidadas)

---

# Parte I — Contexto do projeto

## 1. Visão geral

**Nome:** Biovet Pontos
**Domínio:** `app.biovetfarma.com.br`
**Tipo:** Progressive Web App (PWA) instalável
**Objetivo:** Programa de fidelidade para veterinários parceiros da Biovetfarma. Veterinários acumulam pontos e trocam por benefícios.

### Stack

- **Frontend:** HTML, CSS e JavaScript puro (sem framework)
- **Backend:** Firebase v12 (Auth + Firestore)
- **E-mail:** EmailJS *(será removido — ver roadmap seção 5)*
- **Offline:** Service Worker com cache estratificado
- **Hospedagem:** GitHub Pages (CNAME apontando para o domínio)

### Estrutura de arquivos

```
BIOVETMILHAS-main/
├── CNAME                       # domínio customizado
├── index.html                  # markup das 4 views (auth, home, admin, dashboard)
├── app.js                      # 845 linhas — toda a lógica
├── styles.css                  # 1150 linhas — design system
├── manifest.webmanifest        # config do PWA
├── service-worker.js           # cache offline
├── assets/logo-biovetfarma.png
└── icons/                      # ícones 192 e 512
```

### Tipos de usuário (campo `role` no Firestore)

| Role | Quem é | O que faz |
|---|---|---|
| `vet` | Veterinário parceiro | Vê pontos, carrossel de promoções, troca via WhatsApp |
| `dashboard` | Vendedor/representante | Consulta pontos de parceiros, gerencia carrossel, solicita resgates |
| `admin` | Administrador | Aprovar/revogar usuários, ajustar pontos, definir cotação, aprovar resgates |

### Fluxos principais

- **Cadastro:** usuário cria conta com `approved: false`, fica em espera até admin liberar.
- **Login:** `onAuthStateChanged` lê o `role` no Firestore e direciona para a view correta.
- **Cotação:** admin define quantos pontos equivalem a R$ X (default: 1.000 pts = R$ 15,00).
- **Troca atual (legado):** botão na home gera link `wa.me` pré-preenchido para WhatsApp da Biovetfarma.
- **Troca nova (roadmap):** dashboard solicita resgate em nome do veterinário, admin aprova e anexa comprovante.

## 2. Convenções do código (preservar ao editar)

- **Comentários de seção:** `// ── NOME DA SEÇÃO ──────────────────────`
- **Variáveis e funções em português** (`mostrarHomeView`, `carregarDashboard`, `traduzErro`)
- **Mensagens de erro/sucesso em português brasileiro**
- **CSS variables centralizadas** no `:root` (`--teal`, `--text`, `--shadow-md` etc.)
- **Classes BEM-like:** `pontos-card__shine`, `btn-sm--teal`, `status-badge--approved`
- **Sempre escapar HTML** dinâmico com `esc()` antes de inserir via `innerHTML`

## 3. Configurações sensíveis

Estão atualmente no repositório:
- `firebaseConfig` em `app.js` — OK ficar exposto **se** as Security Rules estiverem corretas (ver seção 4.1)
- `EMAILJS_*` constantes — serão removidas (ver roadmap)
- `WHATSAPP_NUMBER` — `5514997132879`

---

# Parte II — Análise técnica

## 4. Problemas críticos 🚨

### 4.1. Verificar Firestore Security Rules

A API Key do Firebase está exposta no `app.js` — isso é **normal e esperado** em apps web Firebase. **Mas** só é seguro com **Security Rules** corretas no Firestore.

**Ação obrigatória:** confirmar no console do Firebase que existem regras parecidas com:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function userRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    function isAdmin()     { return isSignedIn() && userRole() == 'admin'; }
    function isDashboard() { return isSignedIn() && userRole() == 'dashboard'; }

    match /users/{uid} {
      allow read:   if isSignedIn() && (request.auth.uid == uid || isAdmin() || isDashboard());
      allow create: if isSignedIn() && request.auth.uid == uid
                    && request.resource.data.role == 'vet'
                    && request.resource.data.approved == false
                    && request.resource.data.pontos == 0;
      allow update: if isAdmin(); // só admin altera pontos/approved/role
      allow delete: if isAdmin();
    }

    match /config/{doc} {
      allow read:  if isSignedIn();
      allow write: if isAdmin() || isDashboard();
    }

    // novas coleções (ver roadmap)
    match /resgates/{id} {
      allow read: if isSignedIn() && (isAdmin() || isDashboard() ||
                  resource.data.vetUid == request.auth.uid);
      allow create: if isDashboard() &&
                    request.resource.data.status == 'pendente';
      allow update: if isAdmin();
    }

    match /notificacoes/{id} {
      allow read: if isSignedIn() && (
        resource.data.destinatarioUid == request.auth.uid ||
        resource.data.destinatarioRole == userRole()
      );
      allow create: if isSignedIn();
      allow update: if isSignedIn() && (
        resource.data.destinatarioUid == request.auth.uid ||
        resource.data.destinatarioRole == userRole()
      );
    }
  }
}
```

Se as regras estiverem em modo "test" ou `allow read, write: if true`, há **vazamento de dados pessoais** dos veterinários (CPF, data de nascimento, CRMV, e-mail).

### 4.2. Verificação de role só no cliente

A lógica em `onAuthStateChanged` decide qual view mostrar baseada em `data.role`. Sem regras servidor que validem `role`, um veterinário poderia tentar forjar requisições via console. **A defesa real está nas Security Rules** — não confiar em validações de cliente.

### 4.3. CPF e data de nascimento são dados sensíveis (LGPD)

Atualmente armazenados em texto plano no documento `users/{uid}`. Recomendações:
- Garantir que apenas o próprio usuário e admins leiam esses campos (já feito pelas Security Rules acima).
- Avaliar se o perfil `dashboard` realmente precisa ler esses campos. Se não, mover para subdocumento `users/{uid}/private/data` com regras mais restritas.
- Publicar política de privacidade.
- Incluir consentimento explícito no formulário de cadastro.
- Implementar direito ao apagamento (botão "excluir minha conta").

### 4.4. CPF e CRMV sem validação nem máscara

No `register-form` os inputs têm apenas `placeholder`. Sem `pattern`, sem máscara, sem checagem de dígito verificador. Vai entrar lixo na base.

**Solução:** integrar [imask.js](https://imask.js.org/) ou criar validação manual.

### 4.5. Bug confirmado em produção: campo `role` com espaço em branco

Identificado no Firestore um documento com `role: "dashboard "` (com espaço no final), o que faz a verificação estrita `data.role === 'dashboard'` falhar.

**Fix no `app.js`** — normalizar com `.trim()` em todos os lugares que leem `role`:

```javascript
// onAuthStateChanged
const role = (data.role || '').trim();
if (role === 'admin') { ... }
else if (role === 'dashboard') { ... }

// renderAdminUsers e executarBuscaDash
const parceiros = lista.filter(u => {
  const r = (u.role || '').trim();
  return !r || r === 'vet';
});
```

## 5. Problemas médios ⚠️

### 5.1. Busca baixa todos os usuários

```javascript
const snap = await getDocs(query(collection(db, 'users'), orderBy('nome')));
```

Com 50 parceiros tudo bem. Com 5.000, paga muitas leituras e fica lento.

**Solução:** salvar campo `nome_lower` no documento e usar:
```javascript
where('nome_lower', '>=', termo)
  .where('nome_lower', '<=', termo + '\uf8ff')
  .limit(20)
```

### 5.2. `onclick` inline com template strings

```javascript
el.innerHTML = `... onclick="abrirModalPontos('${u.uid}')" ...`;
```

Seguro hoje porque `u.uid` vem do Auth. Mas frágil — preferir `data-uid="..."` + delegação de eventos.

### 5.3. Imagens do carrossel salvas como base64 no Firestore

Firestore tem limite de **1 MB por documento**. Três imagens base64 num documento só é bomba-relógio. **Solução já planejada no roadmap (seção 9): migrar para Firebase Storage.**

### 5.4. Cache do Service Worker

`CACHE_NAME = 'biovet-v7'` é incrementado manualmente. Esquecer = usuários ficam com versão velha. **Solução já planejada no roadmap (seção 14).**

### 5.5. EmailJS pode ficar silenciosamente desativado

```javascript
const EMAILJS_SERVICE_ID = '';   // se vazio, não notifica
```

**Solução já planejada no roadmap (seção 11): substituir por notificações in-app.**

### 5.6. Splash com timeout fixo de 1.8s

Em conexão rápida o usuário espera à toa. Idealmente esconder quando `onAuthStateChanged` resolver, com mínimo de 600ms.

## 6. Ajustes menores 🔧

- **`alert()` e `confirm()`** em vários lugares — usar o sistema de modal/`form-msg` que já existe.
- **Normalizar e-mail para minúsculas** (`.toLowerCase()`) antes de chamar `signInWithEmailAndPassword` e `createUserWithEmailAndPassword`.
- **Funções globais** (`window.abrirModalPontos` etc.) — preferir event delegation.
- **Imagens do carrossel** sem `loading="lazy"`, sem `width`/`height` — causa *layout shift*.

## 7. Pontos fortes 👏

1. **Código organizado.** `app.js` dividido em seções comentadas, fácil de navegar.
2. **UX cuidadosa.** Splash animada, transições, animação de contador, tradução de erros Firebase.
3. **PWA funcional.** Service worker com estratégia diferenciada (cache-first para assets, network-first para Firebase).
4. **Escape de HTML.** Função `esc()` protege contra XSS.
5. **Fluxo de aprovação manual.** Adequado para programa profissional.
6. **Redimensionamento de imagens no cliente** antes de salvar.

---

# Parte III — Roadmap de evolução

## 8. Dashboard: fluxo de resgate de pontos

### O que muda

Depois de buscar um veterinário e ver seus pontos, aparece um botão **"Trocar pontos"** dentro do card de resultado.

### Fluxo

1. Usuário (perfil `dashboard`) busca o veterinário e vê o card com nome, CRMV, pontos e equivalência em R$.
2. Clica em **"Trocar pontos"**.
3. Abre um modal/formulário com:
   - **Veterinário** (pré-preenchido, read-only): nome + CRMV + UID
   - **Nome do estabelecimento** (input texto, obrigatório)
   - **Pontos a resgatar** (input número, obrigatório, max = pontos do veterinário)
   - **Valor calculado em R$** (exibido em tempo real conforme digita, usando `dashCotacao`)
   - Botão **Confirmar** e **Cancelar**
4. Ao confirmar, grava no Firestore na coleção `resgates` com status `pendente`:

```javascript
{
  vetUid: 'B3gQItW...',
  vetNome: 'Roberto Santos Mussi',
  vetCrmv: '123456',
  estabelecimento: 'Clínica Veterinária X',
  pontosResgatados: 5000,
  valorReais: 75.00,
  cotacaoSnapshot: { pontosBase: 1000, valorReais: 15 },
  status: 'pendente',
  solicitadoPor: { uid: '...', nome: '...' }, // o usuário dashboard
  solicitadoEm: serverTimestamp(),
  comprovanteUrl: null,
  finalizadoEm: null,
  finalizadoPor: null
}
```

> **Decisão importante:** o resgate **NÃO** debita pontos do veterinário no momento da solicitação. Só o admin, ao aprovar e marcar como finalizado, é que executa o débito (em uma transação Firestore para evitar race condition). Isso evita problemas se o pagamento não acontecer.

5. Após gravar, gera um **comprovante para impressão** com:
   - Logo da Biovetfarma
   - Data e hora
   - Dados do veterinário (nome, CRMV, CPF parcialmente mascarado: `392.***.***-47`)
   - Nome do estabelecimento
   - Pontos resgatados e valor em R$
   - Linha para assinatura do solicitante (veterinário)
   - Número do protocolo (ID do documento `resgates`)
   - Texto: *"Declaro estar de acordo com a troca dos pontos acima descritos."*

**Implementação da impressão:** usar `window.print()` numa view dedicada `print-comprovante-view` com CSS `@media print` que esconde tudo o resto. Layout em A4 vertical, fonte 14px, margens 2cm.

### Notas

- O modal deve ter o mesmo estilo do `modal-pontos` que já existe.
- Validar que `pontosResgatados <= u.pontos` antes de habilitar o Confirmar.
- O valor em R$ recalcula em `oninput` usando `calcEquivalencia()`.

## 9. Admin: tela de aprovação de resgates

### O que muda

Adicionar uma **terceira aba** no admin (junto com "Usuários" e "Configurações"): **"Resgates"**, com duas seções:

### 9.1. Pendentes

Lista de cards, cada um mostrando:
- Veterinário (nome + CRMV)
- Estabelecimento
- Pontos resgatados + valor em R$
- Solicitado por (qual dashboard) e quando
- Botão **"Anexar comprovante"** (upload de imagem/PDF, máx 2 MB)
- Botão **"Finalizar"** (só habilita após anexar comprovante)

Ao clicar em **Finalizar**, em uma transação Firestore:
1. Debita `pontosResgatados` do veterinário (`users/{vetUid}.pontos -= pontosResgatados`)
2. Atualiza `resgates/{id}` com `status: 'finalizado'`, `comprovanteUrl`, `finalizadoEm`, `finalizadoPor`
3. Cria notificações (ver seção 11)

### 9.2. Histórico

Lista de resgates finalizados, ordenados por `finalizadoEm desc`. Cada card mostra os mesmos dados + link para baixar o comprovante. Adicionar filtro por mês e busca por nome do veterinário.

### Onde armazenar o comprovante

Usar **Firebase Storage** (não base64 no Firestore). Caminho: `comprovantes/{resgateId}.{ext}`. Salvar a URL pública em `resgates/{id}.comprovanteUrl`.

## 10. Dashboard: melhorar upload do carrossel

### O que muda

Substituir os 3 slots com preview grande pela seguinte UI compacta:

```
┌─────────────────────────────────────────┐
│ 📷 Imagens do Carrossel                 │
│                                         │
│ Imagem 1: ✓ enviada    [Trocar] [×]    │
│ Imagem 2: ✓ enviada    [Trocar] [×]    │
│ Imagem 3: — vazia      [Enviar]        │
│                                         │
│ ℹ Especificações:                       │
│   • Formato: JPG ou PNG                 │
│   • Resolução ideal: 1200 × 600 px      │
│     (proporção 2:1)                     │
│   • Tamanho máximo: 2 MB                │
│   • A imagem será redimensionada        │
│     automaticamente se for maior        │
└─────────────────────────────────────────┘
```

Sem preview. Apenas indicador de status (✓ enviada / — vazia). Clicar em "Trocar" ou "Enviar" abre o seletor de arquivo.

### Onde guardar

Migrar de base64 no Firestore para **Firebase Storage** (`carousel/slot0.jpg`, `slot1.jpg`, `slot2.jpg`). Em `config/carousel` salvar apenas as URLs. Isso resolve o problema do limite de 1 MB por documento.

## 11. Mudar ícone do app e logo

Trocar o `assets/logo-biovetfarma.png` (e os ícones em `icons/`) pela versão **redonda** que já está na pasta `assets/`.

**Importante para PWA:** precisa gerar dois tamanhos no mínimo:
- `icons/icon-192.png` (192×192)
- `icons/icon-512.png` (512×512)
- Idealmente também `icons/icon-maskable-512.png` com `"purpose": "maskable"` no manifest, para o Android renderizar bem em formato circular adaptativo.

Atualizar o `manifest.webmanifest`:

```json
{
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## 12. Sistema de notificações in-app (substituir EmailJS)

### Decisão arquitetural

Remover EmailJS completamente. Criar coleção `notificacoes` no Firestore + um **sino** no header de cada view (home, admin, dashboard) com badge contador.

### Estrutura

```javascript
// notificacoes/{id}
{
  destinatarioUid: 'uid_do_alvo',   // ou null para broadcast por role
  destinatarioRole: 'admin' | 'dashboard' | 'vet',
  tipo: 'novo_cadastro' | 'novo_resgate' | 'resgate_finalizado' | 'cadastro_aprovado' | 'pontos_atualizados',
  titulo: 'Novo cadastro aguardando aprovação',
  mensagem: 'Dr. Fulano (CRMV SP-12345) acabou de se cadastrar.',
  link: 'admin#users',
  lida: false,
  criadaEm: serverTimestamp(),
  metadata: { /* ids relevantes */ }
}
```

### Eventos que geram notificação

| Evento | Destinatário | Quem cria |
|---|---|---|
| Novo cadastro (`approved: false`) | Todos admins | Cliente após `setDoc` do `register-form` |
| Cadastro aprovado (`approved: true`) | O veterinário | Cliente quando admin clica em "Aprovar" |
| Pontos atualizados | O veterinário | Cliente quando admin salva no modal de pontos |
| Solicitação de resgate (status `pendente`) | Todos admins | Cliente quando dashboard cria o resgate |
| Resgate finalizado | O dashboard que solicitou + o veterinário | Cliente na transação de finalização |

### UI do sino

- Botão de sino no header com badge mostrando contagem de não lidas (`lida: false`).
- Clicar abre um painel/drawer lateral com as últimas 20 notificações.
- Ao abrir o painel, marcar como lidas as visíveis.
- Listener em tempo real com `onSnapshot` filtrando `destinatarioUid == auth.currentUser.uid` (ou `destinatarioRole == 'admin' AND auth.currentUser.role == 'admin'`).

### Push notifications no celular

Sim, é possível com **Firebase Cloud Messaging (FCM)**, mas tem custo de complexidade. Fasear em duas etapas:

**Fase A (recomendada começar):**
- Notificações *in-app* com badge no sino — funciona perfeito sem backend extra.
- Notificações no navegador (`Notification` API + Service Worker `showNotification`) — funciona quando o navegador está aberto.
- Cobre 100% dos casos de uso, zero custo, zero infra.

**Fase B (push real, com app fechado):**
- Configurar FCM no console do Firebase.
- Pedir permissão de notificação ao usuário (`Notification.requestPermission()`).
- Registrar o token FCM do dispositivo no `users/{uid}.fcmTokens[]`.
- **Precisa de uma Cloud Function** para escutar `notificacoes/{id}` criadas no Firestore e disparar o push via FCM Admin SDK — isso significa entrar no plano **Blaze** (pay-as-you-go) do Firebase. Para o seu volume provavelmente fica no free tier, mas exige cadastrar cartão.
- **Limitação no iOS:** push só funciona se o usuário **instalou o PWA** na tela inicial. No Safari fora do modo PWA não funciona. iOS 16.4+ obrigatório.

## 13. PWA: instalação automática via QR code

### O que se quer

Um QR code impresso aponta para uma URL — sugestão: `app.biovetfarma.com.br/instalar` — que detecta o navegador/SO e guia a instalação de forma **discreta** (sem mencionar pontos, milhas ou benefícios).

### O que dá pra fazer automaticamente vs. manualmente

| Plataforma | Instalação automática? |
|---|---|
| **Android + Chrome** | Quase. Tem evento `beforeinstallprompt` que permite mostrar um botão "Instalar" que dispara o popup nativo. |
| **Android + outros** | Funciona em Edge, Samsung Internet, Opera. Em outros, fallback para tutorial. |
| **iOS + Safari** | **Não dá automático.** Apple não expõe API. Único caminho é tutorial visual com setas: "Toque em [ícone compartilhar] → Adicionar à Tela de Início". |
| **iOS + Chrome/Firefox** | Não dá nem manual — esses navegadores no iOS não suportam PWA. Precisa instruir: "Abra esta página no Safari". |
| **Desktop** | Chrome/Edge mostram ícone na barra de URL. Pode-se acionar prompt programaticamente. |

### Estrutura da página `/instalar`

```
┌────────────────────────────────────┐
│        [LOGO BIOVETFARMA]          │
│                                    │
│        Acesso ao aplicativo        │
│                                    │
│  [conteúdo dinâmico baseado em UA] │
│                                    │
└────────────────────────────────────┘
```

**Lógica de detecção:**

```javascript
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
const isAndroid = /Android/.test(ua);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                  || window.navigator.standalone === true;

if (isStandalone) {
  // já instalado: redireciona pra /
} else if (isAndroid) {
  // mostra botão "Instalar" + event beforeinstallprompt
} else if (isIOS && isSafari) {
  // tutorial visual: ícone compartilhar → Adicionar à Tela de Início
} else if (isIOS && !isSafari) {
  // pede pra abrir no Safari
} else {
  // desktop: instruções genéricas
}
```

**Conteúdo discreto:**
- Título: "Acesso ao aplicativo Biovetfarma"
- Subtítulo: "Adicione à sua tela inicial para acesso rápido"
- **Sem mencionar pontos, milhas, programa de benefícios, recompensas**

Após instalado, o `start_url` do manifest leva para o app normal com login.

## 14. Animação de letreiro rolante (placa de aeroporto)

### Onde

Entre o card de pontos (`.pontos-card`) e o carrossel (`#home-carousel`) na home view.

### Visual

Um letreiro horizontal estilo split-flap, discreto, em fonte monoespaçada, mostrando rotação de destinos. Não usar texto piscante nem cor chamativa — manter na paleta teal/cinza do app.

### Implementação (opção A — recomendada)

Marquee CSS contínuo:

```html
<div class="flight-board">
  <div class="flight-board-track">
    <span class="flight-row">LA 4521 &nbsp; GRU → CGH &nbsp; 14:25</span>
    <span class="flight-row">TAM 3340 &nbsp; GRU → BSB &nbsp; 15:10</span>
    <!-- ... duplicado para loop infinito -->
  </div>
</div>
```

```css
.flight-board {
  height: 38px;
  overflow: hidden;
  background: #0a1a1c;
  color: #d4a437;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  border-radius: var(--r-sm);
  margin: 12px 0;
  display: flex;
  align-items: center;
}
.flight-board-track {
  display: flex;
  gap: 60px;
  animation: scrollFlights 35s linear infinite;
  white-space: nowrap;
}
@keyframes scrollFlights {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
```

### Opção B (split-flap real)

Cada caractere "vira" como na placa antiga. Biblioteca tipo `splitflap.js`. Bonito, mas pesado. Deixar pra v2.

### Lista de destinos sugerida (20-30 itens)

Códigos de voo fictícios para evitar problema com companhias reais:
```
BVT 101 GRU → CGH 14:25
BVT 202 GRU → BSB 15:10
BVT 303 GRU → SDU 16:00
BVT 404 GRU → MIA 22:30
BVT 505 GRU → LIS 23:15
BVT 606 GRU → AMS 23:55
```
*(definir lista completa antes de implementar)*

## 15. Travamentos no login e atualização sem limpar cache

### 15.1. Travamento no login

Possíveis causas:
- `onAuthStateChanged` dispara antes do Firestore responder; se a rede estiver lenta, fica eterno.
- Sem timeout.

**Fix em `onAuthStateChanged`:**

```javascript
onAuthStateChanged(auth, async (user) => {
  if (isRegistering) return;
  if (!user) { mostrarAuthView(); return; }

  if (window.showLoadingOverlay) window.showLoadingOverlay();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 10000)
  );

  try {
    const snap = await Promise.race([
      getDoc(doc(db, 'users', user.uid)),
      timeoutPromise
    ]);
    // ... resto da lógica
  } catch (err) {
    console.error(err);
    await signOut(auth);
    mostrarAuthView({
      form: 'login-form',
      elId: 'login-error',
      mensagem: err.message === 'timeout'
        ? 'Conexão lenta. Verifique sua internet e tente novamente.'
        : 'Erro ao validar cadastro. Tente novamente.',
      tipo: 'error'
    });
  }
});
```

### 15.2. Cache-busting automático

Causa atual: `CACHE_NAME = 'biovet-v7'` é manual.

**No `service-worker.js`:**

```javascript
const CACHE_NAME = 'biovet-' + (self.__BUILD_ID__ || 'dev-' + Date.now());

self.addEventListener('install', e => { self.skipWaiting(); /* ... */ });
self.addEventListener('activate', e => { self.clients.claim(); /* ... */ });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase/APIs: sempre rede (já tem)
  if (url.hostname.includes('firebaseio.com') /* ... */) {
    e.respondWith(fetch(e.request));
    return;
  }

  // HTML: network-first com fallback cache (garante atualização)
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Resto (imagens, fontes): cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }))
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

**No `app.js` (detectar nova versão e oferecer reload):**

```javascript
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
              window.location.reload();
            });
          }
        });
      });
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
```

UX: pequeno toast "Nova versão disponível — Atualizar" no topo. Não força reload sem aviso.

## 16. PWA responsivo — auditoria de telas

Precisa **testar em dispositivos reais**. Lista:

### Telas a testar

- iPhone SE (375×667), iPhone 14/15 (390×844), iPhone 14 Pro Max (430×932)
- Android pequeno (360×640), Android médio (412×915)
- Tablet retrato (768×1024) e paisagem (1024×768)
- Desktop (1366×768 e 1920×1080)

### O que verificar

- [ ] Splash screen ocupa toda a viewport sem cortes
- [ ] Logo e textos não estouram horizontal
- [ ] Cards têm padding consistente
- [ ] Modal de pontos não fica maior que a tela
- [ ] Carrossel respeita a proporção 2:1
- [ ] Botão WhatsApp não fica colado nas bordas
- [ ] Em iOS com notch: `viewport-fit=cover` (já tem) + `padding: env(safe-area-inset-*)` no header e botões de baixo
- [ ] Form fields com `font-size: 16px` mínimo (iOS dá zoom em <16px)
- [ ] Tab bar do admin não quebra em telas estreitas
- [ ] Dashboard renderiza bem com nomes longos

### CSS sugerido

```css
/* Safe areas iOS */
.app-header {
  padding-top: max(16px, env(safe-area-inset-top));
}
.btn-whatsapp {
  margin-bottom: max(16px, env(safe-area-inset-bottom));
}

/* Font-size mínimo de 16px em inputs (evita zoom no iOS) */
input, select, textarea {
  font-size: max(16px, 1rem);
}

/* Tablet+ */
@media (min-width: 768px) {
  .home-shell, .admin-shell, .dashboard-shell {
    max-width: 720px;
    margin: 0 auto;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .home-shell, .admin-shell, .dashboard-shell {
    max-width: 960px;
  }
}
```

## 17. Ordem sugerida de execução

### Fase 1 — Correções e base (1-2 dias)
1. Fix do `.trim()` no `role`
2. Mudar logo e ícones (seção 11)
3. Auditoria responsiva + safe-areas (seção 16)
4. Cache-busting do SW + auto-update (seção 15.2)
5. Timeout no login (seção 15.1)

### Fase 2 — Funcionalidade core nova (3-4 dias)
6. Coleção `resgates` + fluxo de troca de pontos no dashboard (seção 8)
7. Comprovante imprimível (seção 8)
8. Aba "Resgates" no admin — pendentes + histórico (seção 9)
9. Migrar carrossel para Firebase Storage + UI compacta (seção 10)

### Fase 3 — Notificações in-app (2-3 dias)
10. Coleção `notificacoes` + sino + drawer (seção 12)
11. Listeners em tempo real para cada role
12. Eventos disparando notificações
13. Remover EmailJS

### Fase 4 — Onboarding e detalhes (1-2 dias)
14. Página `/instalar` com detecção de navegador (seção 13)
15. Letreiro rolante de voos (seção 14)
16. Push FCM (opcional — Fase B da seção 12)

---

# Parte IV — Pendências consolidadas

## 18. Checklist geral

### Segurança e conformidade (urgente)
- [ ] Verificar e ajustar Firestore Security Rules (seção 4.1)
- [ ] Adicionar máscara e validação de CPF/CRMV (seção 4.4)
- [ ] Publicar política de privacidade
- [ ] Adicionar consentimento LGPD no cadastro
- [ ] Implementar exclusão de conta (LGPD)
- [ ] Security Rules para `resgates` e `notificacoes`
- [ ] Security Rules para Firebase Storage (carrossel e comprovantes)

### Bugs confirmados
- [ ] `.trim()` no `role` (seção 4.5)
- [ ] Timeout no login (seção 15.1)
- [ ] Cache-busting do SW (seção 15.2)

### Features novas (roadmap)
- [ ] Fluxo de resgate no dashboard (seção 8)
- [ ] Aba de resgates no admin (seção 9)
- [ ] UI compacta do carrossel + Firebase Storage (seção 10)
- [ ] Logo e ícones novos (seção 11)
- [ ] Notificações in-app com sino (seção 12)
- [ ] Página `/instalar` (seção 13)
- [ ] Letreiro de voos (seção 14)
- [ ] Auditoria responsiva (seção 16)

### Qualidade de código (não urgente)
- [ ] Substituir `alert`/`confirm` pelos modais do design system
- [ ] Trocar funções globais (`window.abrirModalPontos`) por event delegation
- [ ] Normalizar e-mail para minúsculas no login/cadastro
- [ ] Adicionar `loading="lazy"` e `width`/`height` nas imagens
- [ ] Paginação na busca de usuários (seção 5.1)

### Decisões pendentes do usuário
- [ ] Adotar plano Blaze do Firebase para FCM push real (Fase B)?
- [ ] URL exata da página de onboarding (`/instalar` ou outra)?
- [ ] Lista definitiva de destinos do letreiro de voos
- [ ] Texto jurídico final do comprovante de resgate
- [ ] CPF no comprovante: mascarado ou completo?

---

*Documento criado em maio de 2026. Última atualização: maio/2026 (unificação de análise + roadmap).*
*Atualize esta linha e o checklist sempre que entregar uma fase.*
