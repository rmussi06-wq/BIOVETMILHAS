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
- **Backend:** Firebase v12 (Auth + Firestore + Storage + Cloud Messaging)
- **Hospedagem:** GitHub Pages (CNAME apontando para `app.biovetfarma.com.br`), **repositório privado** (plano Pro)
- **Plano Firebase:** **Blaze** (pay-as-you-go) — habilita Cloud Functions e FCM push real
- **Offline:** Service Worker com cache estratificado
- **E-mail:** EmailJS *(será removido — ver roadmap Fase 3)*

### Estrutura de arquivos

```
BIOVETMILHAS-main/
├── CLAUDE.md                   # este arquivo
├── CNAME                       # domínio customizado
├── index.html                  # markup das 4 views (auth, home, admin, dashboard)
├── app.js                      # 845 linhas — toda a lógica
├── styles.css                  # 1150 linhas — design system
├── manifest.webmanifest        # config do PWA
├── service-worker.js           # cache offline
├── install.html                # página de onboarding via QR code (Fase 4)
├── robots.txt                  # bloqueio de indexação da /install
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
- **Troca nova (Fase 2):** dashboard solicita resgate em nome do veterinário, admin aprova e anexa comprovante.

## 2. Convenções do código (preservar ao editar)

- **Comentários de seção:** `// ── NOME DA SEÇÃO ──────────────────────`
- **Variáveis e funções em português** (`mostrarHomeView`, `carregarDashboard`, `traduzErro`)
- **Mensagens de erro/sucesso em português brasileiro**
- **CSS variables centralizadas** no `:root` (`--teal`, `--text`, `--shadow-md` etc.)
- **Classes BEM-like:** `pontos-card__shine`, `btn-sm--teal`, `status-badge--approved`
- **Sempre escapar HTML** dinâmico com `esc()` antes de inserir via `innerHTML`

## 3. Configurações sensíveis

- `firebaseConfig` em `app.js` — exposto **por design**, protegido pelas Security Rules (ver seção 4.1)
- `EMAILJS_*` constantes — serão removidas (ver roadmap Fase 3)
- `WHATSAPP_NUMBER` — `5514997132879`

> **Sobre proteção do código-fonte:** o repositório é privado, mas o GitHub Pages serve o HTML/CSS/JS para qualquer visitante autenticado no navegador. **Isso é normal e inerente a qualquer app web** — não há como impedir que um usuário inspecione (F12) o front-end. A segurança real está nas Security Rules do Firestore, não na ocultação do código.

---

# Parte II — Análise técnica

## 4. Problemas críticos 🚨

### 4.1. Firestore Security Rules

A API Key do Firebase está exposta no `app.js` — **normal e esperado** em apps web Firebase. **Só é seguro com Security Rules corretas:**

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

### 4.2. Firebase Storage Rules (para carrossel e comprovantes)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function userRole() {
      return firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role;
    }
    function isAdmin()     { return request.auth != null && userRole() == 'admin'; }
    function isDashboard() { return request.auth != null && userRole() == 'dashboard'; }

    match /carousel/{file} {
      allow read: if request.auth != null;
      allow write: if isAdmin() || isDashboard();
    }

    match /comprovantes/{file} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
  }
}
```

### 4.3. CPF e data de nascimento são dados sensíveis (LGPD)

- Garantir que apenas o próprio usuário e admins leiam esses campos (já feito pelas Security Rules acima).
- Avaliar mover CPF e data de nascimento para subdocumento `users/{uid}/private/data` se `dashboard` não precisar deles.
- Publicar política de privacidade.
- Incluir consentimento explícito no formulário de cadastro.
- Implementar direito ao apagamento (botão "excluir minha conta").

### 4.4. CPF e CRMV sem validação nem máscara

Os inputs têm apenas `placeholder`. Sem `pattern`, sem máscara, sem checagem de dígito verificador. Vai entrar lixo na base.

**Solução:** integrar [imask.js](https://imask.js.org/) ou criar validação manual.

### 4.5. Bug do `role` com espaço em branco — ✅ RESOLVIDO (Fase 1)

Documento no Firestore tinha `role: "dashboard "` (com espaço). Resolvido com `.trim()` em todos os pontos que leem `role`.

## 5. Problemas médios ⚠️

### 5.1. Busca baixa todos os usuários

```javascript
const snap = await getDocs(query(collection(db, 'users'), orderBy('nome')));
```

Com 5.000 usuários, fica lento e caro. **Solução:** salvar campo `nome_lower` no documento e usar:
```javascript
where('nome_lower', '>=', termo)
  .where('nome_lower', '<=', termo + '')
  .limit(20)
```

### 5.2. `onclick` inline com template strings

Frágil. Preferir `data-uid="..."` + delegação de eventos.

### 5.3. Imagens do carrossel salvas como base64 no Firestore — ✅ RESOLVIDO (Fase 2)

Migrado para Firebase Storage (`carousel/slot0.jpg` etc.). Firestore guarda apenas as URLs.

### 5.4. Cache do Service Worker — ✅ RESOLVIDO (Fase 1)

Cache-busting automático + auto-update com toast implementados.

### 5.5. EmailJS pode ficar silenciosamente desativado

**Solução planejada na Fase 3:** substituir por notificações in-app.

### 5.6. Splash com timeout fixo de 1.8s

Em conexão rápida o usuário espera à toa. Idealmente esconder quando `onAuthStateChanged` resolver, com mínimo de 600ms.

## 6. Ajustes menores 🔧

- **`alert()` e `confirm()`** em vários lugares — usar o sistema de modal/`form-msg` que já existe.
- **Normalizar e-mail para minúsculas** (`.toLowerCase()`) — ✅ RESOLVIDO (Fase 1)
- **Funções globais** (`window.abrirModalPontos` etc.) — preferir event delegation.
- **Imagens do carrossel** sem `loading="lazy"`, sem `width`/`height` — causa *layout shift*.

## 7. Pontos fortes 👏

1. **Código organizado** em seções comentadas, fácil de navegar.
2. **UX cuidadosa** — splash animada, transições, animação de contador, tradução de erros Firebase.
3. **PWA funcional** com estratégia de cache diferenciada.
4. **Escape de HTML** com `esc()` protege contra XSS.
5. **Fluxo de aprovação manual** adequado para programa profissional.
6. **Redimensionamento de imagens no cliente** antes de salvar.

---

# Parte III — Roadmap de evolução

## Status atual

- ✅ **Fase 1 (Correções e base) — CONCLUÍDA**
- ✅ **Fase 2 (Fluxo de resgate + carrossel Storage) — CONCLUÍDA**
- ✅ **Fase 3 (Notificações in-app + FCM push) — CONCLUÍDA**
- ✅ **Fase 4 (Onboarding `/install` + letreiro de voos) — CONCLUÍDA**

## 8. ✅ Fase 1 — Correções e base (CONCLUÍDA)

Implementado:
- Fix do `.trim()` no `role` em todos os pontos de leitura
- Timeout de 10s no login com `Promise.race` e mensagem específica de conexão lenta
- `.toLowerCase()` no e-mail no login e cadastro
- Toast de atualização — detecta novo SW instalado, mostra "Nova versão disponível → Atualizar"
- Service Worker v8 — HTML passa a ser network-first, listener `SKIP_WAITING`, cache bumped
- Safe area iOS — `margin-bottom: env(safe-area-inset-bottom)` no botão WhatsApp
- Font-size mínimo 16px nos inputs (evita zoom automático no iOS)
- Breakpoints: tablet 768px (max-width 720px), desktop 1024px (max-width 960px)

**Pendência da Fase 1:** os ícones do PWA serão substituídos manualmente pelo usuário (`icon-192.png` e `icon-512.png`) e o `CACHE_NAME` deve ser incrementado de `v8` para `v9` quando isso acontecer.

## 9. ✅ Fase 2 — Fluxo de resgate de pontos (CONCLUÍDA)

Implementado:
- Dashboard: botão "Trocar pontos" nos cards de resultado da busca
- Modal de resgate com validação, cálculo em tempo real e gravação em `resgates` (status `pendente`, sem debitar pontos)
- View `print-comprovante-view` com layout A4, `@media print` e botões Voltar/Imprimir
- `mascararCpf()` — CPF mascarado como `392.***.***-47` no comprovante
- Admin: terceira aba "Resgates" com seções Pendentes e Histórico
- Admin: modal "Finalizar Resgate" com upload de comprovante para Firebase Storage (`comprovantes/{id}`)
- Admin: `runTransaction` — debita pontos do vet e atualiza status para `finalizado` atomicamente
- Carrossel: upload migrado para Firebase Storage (`carousel/slot0.jpg` etc.), Firestore guarda URLs
- Carrossel: UI compacta (sem preview grande, apenas status Ativa/Vazia + botões Substituir/Remover)

### 9.1. Dashboard: botão "Trocar pontos"

Depois de buscar um veterinário e ver seus pontos, aparece um botão **"Trocar pontos"** dentro do card de resultado.

**Fluxo:**

1. Dashboard busca o veterinário.
2. Clica em **"Trocar pontos"**.
3. Abre modal com:
   - **Veterinário** (read-only): nome + CRMV
   - **Nome do estabelecimento** (obrigatório)
   - **Pontos a resgatar** (obrigatório, max = pontos do veterinário)
   - **Valor em R$** (calculado em tempo real)
   - Botões **Confirmar** e **Cancelar**
4. Ao confirmar, grava em `resgates`:

```javascript
{
  vetUid: 'B3gQItW...',
  vetNome: 'Roberto Santos Mussi',
  vetCrmv: '123456',
  vetCpf: '39214881847',         // CPF completo armazenado (mascarado só na impressão)
  estabelecimento: 'Clínica Veterinária X',
  pontosResgatados: 5000,
  valorReais: 75.00,
  cotacaoSnapshot: { pontosBase: 1000, valorReais: 15 },
  status: 'pendente',
  solicitadoPor: { uid: '...', nome: '...' },
  solicitadoEm: serverTimestamp(),
  comprovanteUrl: null,
  finalizadoEm: null,
  finalizadoPor: null
}
```

> **Decisão arquitetural:** o resgate **NÃO** debita pontos no momento da solicitação. Só o admin, ao finalizar, executa o débito numa **transação Firestore** (evita race condition se houver várias solicitações simultâneas).

5. Após gravar, abre uma view dedicada **`print-comprovante-view`** com o comprovante pronto pra `window.print()`.

### 9.2. Comprovante de resgate (decisões consolidadas)

**Layout A4 vertical**, fonte 14px, margens 2cm, CSS `@media print` esconde o resto do app.

**Conteúdo:**
- Logo da Biovetfarma no topo
- Título: **"Comprovante de Resgate de Pontos"**
- Data e hora da solicitação
- Número do protocolo (ID do documento `resgates`)
- Dados do veterinário:
  - Nome completo
  - CRMV
  - CPF **mascarado**: `392.***.***-47`
- Nome do estabelecimento
- Pontos resgatados
- Valor em R$
- Cotação aplicada (snapshot no momento do resgate)
- Texto jurídico:

> *"Declaro, para os devidos fins, que solicitei e recebi o resgate dos pontos acumulados no programa Biovet Pontos."*

- Linha para assinatura do veterinário com data
- Rodapé com nome "Biovetfarma — Manipulação Veterinária"

**Função de máscara de CPF:**

```javascript
function mascararCpf(cpf) {
  const limpo = String(cpf).replace(/\D/g, '');
  if (limpo.length !== 11) return cpf;
  return `${limpo.slice(0,3)}.***.***-${limpo.slice(-2)}`;
}
```

### 9.3. Admin: aba "Resgates"

Terceira aba no admin com duas seções: **Pendentes** e **Histórico**.

- Cards com: nome + CRMV do vet, CPF mascarado, estabelecimento, pontos, valor, protocolo, data
- Pendentes: botão "Finalizar" que abre modal com upload de comprovante (PDF/imagem)
- Ao finalizar: upload para `comprovantes/{resgateId}` no Storage + `runTransaction` debita pontos e atualiza status

### 9.4. Carrossel — UI compacta + Firebase Storage ✅

Upload migrado para Firebase Storage. UI compacta mostra status Ativa/Vazia + botões Substituir/Remover por slot.

## 10. ✅ Fase 3 — Notificações in-app + FCM push real (CONCLUÍDA)

### 10.1. Coleção `notificacoes` + sino

Remover EmailJS completamente. Criar coleção `notificacoes` no Firestore + **sino** no header de cada view com badge contador.

**Estrutura:**

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

### 10.2. Eventos que geram notificação

| Evento | Destinatário | Quem cria |
|---|---|---|
| Novo cadastro (`approved: false`) | Todos admins | Cliente após `setDoc` do `register-form` |
| Cadastro aprovado | O veterinário | Cliente quando admin clica em "Aprovar" |
| Pontos atualizados | O veterinário | Cliente quando admin salva no modal |
| Solicitação de resgate | Todos admins | Cliente quando dashboard cria o resgate |
| Resgate finalizado | Dashboard solicitante + veterinário | Cliente na transação de finalização |

### 10.3. UI do sino

- Botão de sino no header com badge de contagem.
- Clicar abre drawer lateral com últimas 20 notificações.
- Ao abrir, marca como lidas as visíveis.
- Listener em tempo real com `onSnapshot`.

### 10.4. FCM Push Real (plano Blaze já ativo ✅)

Como o plano **Blaze já está habilitado**, dá pra implementar push real nesta mesma fase:

1. **Habilitar Cloud Messaging** no console do Firebase.
2. **Gerar VAPID key** em Settings → Cloud Messaging → Web Push certificates.
3. **No `app.js`:**
   - Pedir permissão: `Notification.requestPermission()`
   - Obter token: `getToken(messaging, { vapidKey: '...' })`
   - Salvar em `users/{uid}.fcmTokens[]`
4. **Cloud Function `onCreate`** em `notificacoes/{id}`:
   - Lê o documento
   - Resolve destinatários (UID direto ou todos os UIDs de uma role)
   - Pega `fcmTokens` desses usuários
   - Envia push via FCM Admin SDK
5. **No `service-worker.js`:**
   - Listener `messaging.onBackgroundMessage` para mostrar notificação quando app fechado

**Limitação iOS:** push só funciona no iOS se o PWA foi **instalado** na tela inicial (iOS 16.4+).

## 11. ✅ Fase 4 — Página `/install` + letreiro de voos (CONCLUÍDA)

### 11.1. Página `/install` (anti-indexação)

URL: `app.biovetfarma.com.br/install` (minúsculas).

**Objetivo:** página discreta acessada apenas via QR code impresso, que detecta o navegador/SO e guia a instalação do PWA. **Sem mencionar pontos, milhas, programa de benefícios ou recompensas.**

**Camadas de anti-indexação:**

1. **`robots.txt` na raiz do site:**
```
User-agent: *
Disallow: /install
Disallow: /install.html

User-agent: Googlebot
Disallow: /install
Disallow: /install.html
```

2. **Meta tags no `<head>` do `install.html`:**
```html
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow">
<meta name="bingbot" content="noindex, nofollow">
```

3. **Sem links internos** apontando para `/install` em nenhum lugar do app.
4. **Sem entrada no `manifest.webmanifest`** — `start_url` continua `./index.html`.
5. **Sem sitemap.xml** ou, se existir, não incluir `/install`.

**Conteúdo da página (discreto):**

- Logo da Biovetfarma
- Título: **"Acesso ao aplicativo Biovetfarma"**
- Subtítulo: **"Adicione à sua tela inicial para acesso rápido"**
- Conteúdo dinâmico baseado em User Agent

**Lógica de detecção:**

```javascript
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
const isAndroid = /Android/.test(ua);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                  || window.navigator.standalone === true;

if (isStandalone) {
  // já instalado: redireciona para /
  window.location.replace('/');
} else if (isAndroid) {
  // captura beforeinstallprompt e mostra botão "Instalar"
} else if (isIOS && isSafari) {
  // tutorial visual: ícone compartilhar → Adicionar à Tela de Início
} else if (isIOS && !isSafari) {
  // pede pra abrir no Safari
} else {
  // desktop: instruções genéricas
}
```

> **Após o PWA ser instalado**, abrir o app pela tela inicial vai direto para `index.html` (login normal). A página `/install` só aparece quando alguém escaneia o QR code pelo navegador.

### 11.2. Letreiro rolante de voos (placa de aeroporto)

**Onde:** entre `.pontos-card` e `#home-carousel` na home view.

**Visual:** marquee CSS contínuo, fonte monoespaçada, fundo escuro `#0a1a1c`, texto âmbar `#d4a437`.

```html
<div class="flight-board">
  <div class="flight-board-track">
    <span class="flight-row">BVT 101 &nbsp; GRU → CGH &nbsp; 14:25</span>
    <span class="flight-row">BVT 202 &nbsp; GRU → BSB &nbsp; 15:10</span>
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

**Códigos de voo:** prefixo fictício `BVT` (Biovet) para evitar problema com companhias reais. Lista definitiva a confirmar com o usuário antes da implementação.

---

# Parte IV — Pendências consolidadas

## 12. Decisões consolidadas pelo usuário ✅

| Decisão | Resposta final |
|---|---|
| CPF no comprovante | **Mascarado** (`392.***.***-47`) |
| Texto jurídico | *"Declaro, para os devidos fins, que solicitei e recebi o resgate dos pontos acumulados no programa Biovet Pontos."* |
| Itens do comprovante | Os já listados na seção 9.2, sem adições |
| Plano Blaze do Firebase | ✅ **Já ativado** — Fase 3 inclui FCM push real |
| URL de onboarding | `/install` (minúsculas) |
| Anti-indexação `/install` | `robots.txt` + meta `noindex` + sem links internos + sem sitemap |
| Repositório GitHub | **Privado** (plano Pro) |
| HTTPS | Aguardando propagação DNS (24-48h); ativar **Enforce HTTPS** quando disponível |

## 13. Pendências do usuário (ainda em aberto)

- [ ] **Substituir manualmente** `icons/icon-192.png` e `icons/icon-512.png` pelos arquivos quadrados recortados da logo
- [ ] Após substituir os ícones, pedir ao Claude Code para incrementar `CACHE_NAME` de v8 para v9
- [ ] Marcar **Enforce HTTPS** em Settings → Pages assim que o certificado for emitido (24-48h)
- [x] Fase 2 — Fluxo de resgate completo + carrossel no Storage
- [x] Fase 3 — Notificações in-app + FCM push real (Blaze ativo)
- [x] Fase 4 — Página `/install` + letreiro de voos

### Qualidade de código (não urgente)
- [ ] Substituir `alert`/`confirm` pelos modais do design system
- [ ] Trocar funções globais (`window.abrirModalPontos`) por event delegation
- [ ] Adicionar `loading="lazy"` e `width`/`height` nas imagens
- [ ] Paginação na busca de usuários (seção 5.1)
- [ ] Subdocumento `users/{uid}/private/data` para CPF/data de nascimento

---

*Documento atualizado em maio de 2026. Última revisão: Fase 4 concluída — página /install (onboarding via QR Code, detecção de SO/navegador, design discreto), robots.txt, letreiro rolante de voos na home-view do vet. — notificações in-app (coleção Firestore, sino com badge, drawer lateral, onSnapshot em tempo real), FCM push (permissão, token, service worker, Cloud Function). Próximo passo: Fase 4 (página /install + letreiro de voos).*
*Atualize esta linha e o checklist sempre que entregar uma fase.*
