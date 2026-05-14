# CLAUDE.md — Biovetfarma Platform

> **Fonte única de verdade** do ecossistema de aplicações da Biovetfarma.
> Atualizado em: 2025. Mantenha este arquivo atualizado a cada entrega significativa.

---

## Índice

- [Parte I — Visão geral do ecossistema](#parte-i--visão-geral-do-ecossistema)
- [Parte II — Stack e infraestrutura](#parte-ii--stack-e-infraestrutura)
- [Parte III — Roles e controle de acesso](#parte-iii--roles-e-controle-de-acesso)
- [Parte IV — Módulo 1: Biovet Pontos](#parte-iv--módulo-1-biovet-pontos)
- [Parte V — Módulo 2: Guia de Prescrição](#parte-v--módulo-2-guia-de-prescrição)
- [Parte VI — Estrutura de dados Firestore](#parte-vi--estrutura-de-dados-firestore)
- [Parte VII — Firestore Security Rules](#parte-vii--firestore-security-rules)
- [Parte VIII — Convenções de código](#parte-viii--convenções-de-código)
- [Parte IX — Roadmap e pendências](#parte-ix--roadmap-e-pendências)

---

# Parte I — Visão geral do ecossistema

## 1. Contexto

A Biovetfarma opera **duas plataformas integradas** no mesmo domínio e mesmo projeto Firebase:

| Plataforma | URL | Finalidade |
|---|---|---|
| **Biovet Pontos** | `app.biovetfarma.com.br/` | Programa de fidelidade para veterinários parceiros |
| **Guia de Prescrição** | `app.biovetfarma.com.br/guia/` | Compêndio veterinário digital com escritor no-code e leitura interativa |
| **Verificação de Receituário** | `app.biovetfarma.com.br/receituario/verificar.html` | Página pública de autenticação de receituários via QR Code |

Ambas as plataformas compartilham:
- O mesmo projeto Firebase (`biovet-parceiro-vet`)
- O mesmo sistema de autenticação (Firebase Auth)
- O mesmo banco de dados (Firestore)
- O mesmo design system (CSS variables, tipografia, cores)

## 2. Estrutura de arquivos completa

```
app.biovetfarma.com.br/               ← GitHub Pages (repositório privado)
│
├── index.html                        ← Shell do Biovet Pontos (auth + home + admin + dashboard)
├── app.js                            ← Lógica do Biovet Pontos + roteamento de roles
├── styles.css                        ← Design system global
├── manifest.webmanifest              ← Config PWA
├── service-worker.js                 ← Cache offline
├── CNAME                             ← app.biovetfarma.com.br
├── assets/
│   └── logo-biovetfarma.png
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
│
├── guia/                             ← Módulo Guia de Prescrição (NOVO)
│   ├── index.html                    ← Shell do Guia (views: leitura + escritor)
│   ├── guia.js                       ← Lógica do Guia (auth, editor, busca, calculadora, receituário)
│   └── guia.css                      ← Estilos do Guia (importa variáveis do design system)
│
└── receituario/                      ← Verificação pública (NOVO)
    └── verificar.html                ← Página sem login para validar QR Code de receituário
```

---

# Parte II — Stack e infraestrutura

## 3. Stack técnica

| Camada | Tecnologia |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript puro (ES Modules) — sem framework |
| **Auth** | Firebase Auth v12 (email/senha) |
| **Banco de dados** | Cloud Firestore v12 |
| **Storage** | Firebase Storage v12 (imagens do carrossel, PDFs de referência) |
| **IA — Assistente** | Google Gemini API (`gemini-2.0-flash`) — integrado no Guia/Escritor |
| **QR Code** | Biblioteca `qrcode.js` (CDN) — geração client-side |
| **PDF** | `jsPDF` (CDN) — geração de receituário imprimível |
| **Offline** | Service Worker com cache estratificado |
| **Hospedagem** | GitHub Pages, repositório privado (plano Pro) |
| **Domínio** | CNAME `app.biovetfarma.com.br` |
| **Plano Firebase** | Blaze (pay-as-you-go) |

## 4. Configuração Firebase

```javascript
// app.js e guia/guia.js — mesmo firebaseConfig
const firebaseConfig = {
  apiKey:            "AIzaSyCW2HG6ECzk6OD0cenYqY1R3rsJ1Oecgek",
  authDomain:        "biovet-parceiro-vet.firebaseapp.com",
  projectId:         "biovet-parceiro-vet",
  storageBucket:     "biovet-parceiro-vet.firebasestorage.app",
  messagingSenderId: "549792200166",
  appId:             "1:549792200166:web:0cf14a3895227b79031227"
};
```

> **Segurança:** a API Key exposta é normal em apps web Firebase. A segurança real está nas Security Rules do Firestore (ver Parte VII).

## 5. APIs externas

| API | Uso | Onde configurar |
|---|---|---|
| **Gemini API** | Assistente de escrita no Editor | Constante `GEMINI_API_KEY` em `guia/guia.js` |
| **EmailJS** | Notificações de cadastro por e-mail | Constantes `EMAILJS_*` em `app.js` *(legado — remover na Fase 3)* |
| **WhatsApp** | Link de troca de pontos | Constante `WHATSAPP_NUMBER = '5514997132879'` em `app.js` |

---

# Parte III — Roles e controle de acesso

## 6. Tabela de roles

O campo `role` no documento `/users/{uid}` do Firestore determina para qual view o usuário é direcionado após o login.

| Role | Quem é | Acesso Biovet Pontos | Acesso Guia de Prescrição |
|---|---|---|---|
| `admin` | Administrador Biovetfarma | ✅ Painel completo (usuários, pontos, cotação, resgates) | ❌ (futuramente: gerenciar livro) |
| `dashboard` | Vendedor / representante | ✅ Consulta pontos, carrossel, solicita resgates | ❌ |
| `vet` | Veterinário parceiro | ✅ Ver pontos, trocar via WhatsApp | ✅ Leitura do Guia, calculadora, receituário |
| `vet2` | Veterinário externo / leitor | ❌ Sem acesso ao programa de pontos | ✅ Leitura do Guia, calculadora, receituário |
| `escritor` | Redator de conteúdo | ❌ | ✅ Editor no-code do livro (criar, editar, publicar fichas) |

## 7. Fluxo de roteamento

### `index.html` / `app.js` (Biovet Pontos)

```
onAuthStateChanged
  └─ user logado → busca /users/{uid} no Firestore
       ├─ role === 'admin'          → carregarAdmin()     → mostrarAdminView()
       ├─ role === 'dashboard'      → carregarDashboard() → mostrarDashboardView()
       ├─ role === 'vet'
       │    └─ approved === true    → carregarDadosHome() → mostrarHomeView()
       │         (home-view inclui card de acesso ao Guia de Prescrição)
       ├─ role === 'vet2'           → redirect para /guia/
       ├─ role === 'escritor'       → redirect para /guia/
       └─ approved === false        → logout + mensagem "aguarde aprovação"
```

### `guia/index.html` / `guia/guia.js` (Guia de Prescrição)

```
onAuthStateChanged
  └─ user logado → busca /users/{uid} no Firestore
       ├─ role === 'escritor'  → mostrarViewEscritor()
       ├─ role === 'vet'       → mostrarViewLeitura()
       ├─ role === 'vet2'      → mostrarViewLeitura()
       └─ qualquer outro role  → redirect para / (Biovet Pontos)
```

### `receituario/verificar.html`

```
Página pública (sem login obrigatório)
  └─ Lê ?id=ABC123 da URL
       └─ Busca /receituarios/{id} no Firestore (leitura pública permitida)
            ├─ Encontrado  → exibe dados + badge "✅ Receituário Autêntico"
            └─ Não encontrado → exibe "❌ Receituário não encontrado ou inválido"
```

## 8. Campo `approved` por role

| Role | Precisa de aprovação admin? |
|---|---|
| `vet` | ✅ Sim — cadastra com `approved: false`, admin aprova |
| `vet2` | ✅ Sim — mesmo fluxo do vet |
| `escritor` | ✅ Sim — admin cria manualmente ou aprova |
| `admin` | N/A — criado diretamente no Firestore |
| `dashboard` | N/A — criado diretamente no Firestore |

---

# Parte IV — Módulo 1: Biovet Pontos

## 9. Views existentes

| View | ID no HTML | Role | Descrição |
|---|---|---|---|
| Auth | `#auth-view` | Todos | Login, cadastro, recuperação de senha |
| Home | `#home-view` | `vet` | Saldo de pontos, carrossel, link WhatsApp, **link Guia (NOVO)** |
| Admin | `#admin-view` | `admin` | Gerenciar usuários, cotação, resgates |
| Dashboard | `#dashboard-view` | `dashboard` | Consultar parceiros, solicitar resgates |

## 10. Adição ao role `vet` — link para o Guia

Na `#home-view`, adicionar um card/botão de acesso ao Guia de Prescrição:

```html
<!-- Inserir após o card de pontos, antes do carrossel -->
<a href="/guia/" class="btn btn-guia">
  📖 Guia de Prescrição Biovetfarma
</a>
```

O botão só aparece quando `role === 'vet'`. Redireciona para `/guia/` onde o `guia.js` detecta o role e abre a view de leitura.

## 11. Fluxos do Biovet Pontos (preservar)

- **Cadastro:** `approved: false`, aguarda admin
- **Cotação:** admin define `pontosBase` e `valorReais` em `/config/cotacao`
- **Troca:** botão WhatsApp gera `wa.me` pré-preenchido
- **Resgate via dashboard:** dashboard solicita → admin aprova com comprovante
- **Carrossel:** imagens no Firebase Storage, gerenciadas pelo dashboard/admin

---

# Parte V — Módulo 2: Guia de Prescrição

## 12. View Escritor

### Objetivo
Plataforma no-code para que usuários com `role === 'escritor'` criem e editem fichas de medicamentos veterinários, similar ao Vetsmart (`vetsmart.com.br`).

### Layout (inspirado no Vetsmart)

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: Logo + "Guia de Prescrição Biovetfarma" + Sair │
├────────────────┬────────────────────────────────────────┤
│  SIDEBAR       │  ÁREA DE EDIÇÃO                        │
│  Lista de      │                                        │
│  medicamentos  │  [Campo: Nome Comercial]               │
│  (filtro por   │  [Campo: Princípio(s) Ativo(s)]        │
│  categoria /   │  [Campo: Classificação]                │
│  status)       │  [Campo: Espécies]                     │
│                │                                        │
│  [+ Novo]      │  Abas:                                 │
│                │  ● Sobre / Indicações                  │
│                │  ● Administração e Doses               │
│                │  ● Interações                          │
│                │  ● Farmacologia                        │
│                │  ● Referências                         │
│                │                                        │
│                │  [✨ Melhorar com IA]  [💾 Salvar]    │
│                │  [👁 Preview]          [🚀 Publicar]  │
└────────────────┴────────────────────────────────────────┘
```

### Campos da ficha de medicamento

```
Seção 1 — Identificação
  - Nome Comercial (texto)
  - Princípios Ativos (tags — múltiplos)
  - Fabricante (texto)
  - Classificação (select: Antibiótico, Anti-inflamatório, Anestésico, Suplemento, etc.)
  - Espécies (multi-select: Cães, Gatos, Bovinos, Equinos, Aves, etc.)
  - Status (rascunho | publicado)

Seção 2 — Sobre
  - Descrição geral (textarea — suporta Markdown básico)

Seção 3 — Indicações e Contraindicações
  - Indicações (textarea)
  - Contraindicações (textarea)

Seção 4 — Administração e Doses
  - Tabela editável por espécie:
    | Espécie | Dose Mín (mg/kg) | Dose Máx (mg/kg) | Via | Intervalo | Duração |
  - Observações gerais de posologia (textarea)

Seção 5 — Interações Medicamentosas
  - Interações (textarea)

Seção 6 — Farmacologia
  - Mecanismo de ação (textarea)
  - Farmacocinética (textarea)

Seção 7 — Referências Bibliográficas
  - Lista de referências (campo dinâmico — adicionar/remover)
  - Upload de PDF como referência de escrita (não publicado — usado apenas no contexto da IA)
```

### Assistente Gemini — "✨ Melhorar com IA"

O escritor pode selecionar qualquer seção e clicar em **"Melhorar com IA"**. O sistema:

1. Coleta o texto atual da seção
2. (Opcional) Lê o PDF de referência enviado pelo escritor via `FileReader` → base64
3. Monta o prompt e envia para a Gemini API:

```javascript
// Endpoint
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Prompt base — sempre incluído
const PROMPT_BASE = `
Você é um especialista em medicina veterinária e farmacologia veterinária.
Reescreva o texto abaixo com linguagem técnica precisa, adequada para um compêndio
farmacológico veterinário profissional. Baseie-se nas seguintes referências:
- Formulário Veterinário Brasileiro (3ª edição)
- MAPA - Compêndio de Produtos Veterinários
- Plumb's Veterinary Drug Handbook (10ª edição)
- Ettinger's Textbook of Veterinary Internal Medicine
Mantenha as informações factuais. Melhore clareza, precisão técnica e completude.
Responda apenas com o texto melhorado, sem explicações adicionais.

Seção: [NOME_DA_SEÇÃO]
Texto original:
[TEXTO_DO_ESCRITOR]
`;

// Request body
const body = {
  contents: [{
    parts: [
      { text: promptFinal },
      // Se PDF enviado:
      { inlineData: { mimeType: "application/pdf", data: base64PDF } }
    ]
  }]
};
```

4. Exibe a sugestão em um modal lado a lado com o original
5. Escritor escolhe: **Aceitar** | **Editar** | **Descartar**

### Publicação

- **Salvar rascunho:** `status: "rascunho"` — visível apenas ao escritor
- **Publicar:** `status: "publicado"` — visível para vet e vet2 na view de leitura
- Ambas as ações atualizam `atualizadoEm: serverTimestamp()`

---

## 13. View Leitura

### Objetivo
Interface interativa para `vet` e `vet2` consultarem o compêndio veterinário, calcular doses e emitir receituários digitais autenticados.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: Logo + "Guia de Prescrição" + nome do vet + Sair│
├─────────────────────────────────────────────────────────┤
│  🔍 [Buscar por nome comercial ou princípio ativo...]   │
├────────────────┬────────────────────────────────────────┤
│  LISTA DE      │  FICHA DO MEDICAMENTO                  │
│  RESULTADOS    │                                        │
│  (cards com    │  RenaDogs®  por BIOCTAL                │
│  nome +        │  ★★★★★  27 avaliações                 │
│  princípio     │  Classificação: Suplemento, Nutracêutico│
│  ativo)        │  Espécies: Cães                        │
│                │                                        │
│                │  [Sobre][Indicações][Doses][Interações]│
│                │  [Farmacologia]                        │
│                │                                        │
│                │  ──────────────────────────────────    │
│                │  🧮 CALCULADORA DE DOSE                │
│                │  Espécie: [Cães ▼]  Peso: [___] kg    │
│                │  → Dose: X mg  (X a Y mg/kg)          │
│                │  Concentração do produto: [___] mg/ml  │
│                │  → Volume: X ml                        │
│                │                                        │
│                │  [📄 Emitir Receituário]               │
└────────────────┴────────────────────────────────────────┘
```

### Busca por ativos

- Busca em tempo real (debounce 300ms) nos campos:
  - `nomeComercial` (contains, case-insensitive)
  - `principiosAtivos[]` (array-contains)
- Apenas medicamentos com `status === "publicado"` aparecem
- Resultado exibido em cards na sidebar esquerda

### Calculadora de dose

```javascript
// Lógica de cálculo
function calcularDose(pesoKg, doseMin, doseMax, concentracaoMgMl) {
  const doseMinTotal = doseMin * pesoKg;  // mg
  const doseMaxTotal = doseMax * pesoKg;  // mg
  const volumeMin    = concentracaoMgMl ? doseMinTotal / concentracaoMgMl : null;  // ml
  const volumeMax    = concentracaoMgMl ? doseMaxTotal / concentracaoMgMl : null;  // ml

  return { doseMinTotal, doseMaxTotal, volumeMin, volumeMax };
}
```

Exibe: `"Dose: 150 mg a 300 mg  |  Volume: 1,5 ml a 3,0 ml"`

---

## 14. Receituário Digital

### Fluxo de emissão

1. Vet clica em **"📄 Emitir Receituário"** na ficha do medicamento
2. Modal abre com formulário:
   ```
   Nome do paciente:      [___________]
   Espécie / Raça:        [___________]
   Peso:                  [___] kg
   Nome do tutor/prop.:   [___________]
   
   Medicamento:           [preenchido automaticamente]
   Dose calculada:        [preenchido automaticamente]
   Posologia:             [___________] (ex: "1x ao dia por 10 dias")
   Via de administração:  [___________]
   Observações:           [___________]
   
   Data:                  [hoje — preenchido]
   Médico Vet:            [nome do usuário logado]
   CRMV:                  [crmv do usuário logado]
   
   Assinatura digital:    [Canvas para assinar com mouse/touch]
   ```

3. Ao confirmar:
   - Gera `id` único (`crypto.randomUUID()`)
   - Calcula `hash` SHA-256 do conteúdo (garantia de integridade)
   - Salva em Firestore: `/receituarios/{id}`
   - Gera QR Code apontando para: `https://app.biovetfarma.com.br/receituario/verificar.html?id={id}`
   - Exibe receituário formatado para impressão com o QR Code

### Estrutura do documento `/receituarios/{id}`

```javascript
{
  id:                 "uuid-gerado",
  hash:               "sha256-do-conteudo",
  vetUid:             "uid-do-firebase-auth",
  vetNome:            "Dr. João Silva",
  vetCrmv:            "SP-12345",
  pacienteNome:       "Thor",
  pacienteEspecie:    "Cão",
  pacienteRaca:       "Golden Retriever",
  pacientePeso:       32,
  tutorNome:          "Maria Souza",
  medicamentoId:      "id-do-medicamento-no-firestore",
  medicamentoNome:    "RenaDogs®",
  principioAtivo:     "Carbonato de Cálcio / Quitosana",
  doseCalculada:      "480 mg",
  posologia:          "1 comprimido ao dia por 30 dias",
  via:                "Oral",
  observacoes:        "",
  assinaturaBase64:   "data:image/png;base64,...",
  dataEmissao:        Timestamp,
  criadoEm:           serverTimestamp()
}
```

### Layout do receituário imprimível (A4)

```
┌─────────────────────────────────────────────────────────┐
│  [Logo Biovetfarma]        RECEITUÁRIO VETERINÁRIO      │
│                            Nº: ABC123  |  Data: 01/01/25│
├─────────────────────────────────────────────────────────┤
│  MÉDICO VETERINÁRIO                                     │
│  Dr. João Silva — CRMV SP-12345                         │
├─────────────────────────────────────────────────────────┤
│  PACIENTE                                               │
│  Nome: Thor  |  Espécie: Cão  |  Raça: Golden Retriever │
│  Peso: 32 kg  |  Tutor: Maria Souza                     │
├─────────────────────────────────────────────────────────┤
│  PRESCRIÇÃO                                             │
│                                                         │
│  Medicamento: RenaDogs®                                 │
│  Princípio ativo: Carbonato de Cálcio / Quitosana       │
│  Dose: 480 mg                                           │
│  Posologia: 1 comprimido ao dia por 30 dias             │
│  Via: Oral                                              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Assinatura Digital]          [QR Code de autenticação]│
│                                Escaneie para verificar  │
└─────────────────────────────────────────────────────────┘
```

### Verificação pública (`/receituario/verificar.html`)

Página **sem login** acessível por qualquer pessoa (farmácia, tutor, fiscalização):

```javascript
// Lê ?id=ABC123 da URL
const params  = new URLSearchParams(window.location.search);
const id      = params.get('id');

// Busca no Firestore (leitura pública — ver Security Rules)
const snap = await getDoc(doc(db, 'receituarios', id));

if (snap.exists()) {
  // Exibe dados + badge verde "✅ Receituário Autêntico"
  // Mostra: vet, CRMV, paciente, medicamento, data
  // NÃO exibe: assinatura base64, hash interno
} else {
  // Badge vermelho "❌ Receituário não encontrado ou inválido"
}
```

---

# Parte VI — Estrutura de dados Firestore

## 15. Coleções e documentos

```
/users/{uid}
  - nome:       string
  - email:      string
  - cpf:        string
  - crmv:       string
  - dataNasc:   string
  - role:       "admin" | "dashboard" | "vet" | "vet2" | "escritor"
  - approved:   boolean
  - pontos:     number          (apenas role vet)
  - criadoEm:   Timestamp

/config/cotacao
  - pontosBase: number          (ex: 1000)
  - valorReais: number          (ex: 15.00)
  - atualizadoEm: Timestamp

/config/carousel
  - items: [{url, storagePath, ordem}]

/resgates/{id}
  - vetUid:       string
  - vetNome:      string
  - pontos:       number
  - dashUid:      string
  - dashNome:     string
  - status:       "pendente" | "aprovado" | "rejeitado"
  - comprovanteUrl: string
  - criadoEm:     Timestamp
  - finalizadoEm: Timestamp

/livro/medicamentos/{id}            ← NOVO
  - nomeComercial:      string
  - principiosAtivos:   string[]
  - fabricante:         string
  - classificacao:      string
  - especies:           string[]
  - sobre:              string
  - indicacoes:         string
  - contraindicacoes:   string
  - posologiaTabela:    [{especie, doseMin, doseMax, unidade, via, intervalo, duracao}]
  - posologiaObs:       string
  - interacoes:         string
  - mecanismoAcao:      string
  - farmacocinetica:    string
  - referencias:        string[]
  - status:             "rascunho" | "publicado"
  - criadoPor:          string        (uid)
  - criadoEm:           Timestamp
  - atualizadoEm:       Timestamp

/receituarios/{id}                  ← NOVO
  - hash:               string       (SHA-256 do conteúdo)
  - vetUid:             string
  - vetNome:            string
  - vetCrmv:            string
  - pacienteNome:       string
  - pacienteEspecie:    string
  - pacienteRaca:       string
  - pacientePeso:       number
  - tutorNome:          string
  - medicamentoId:      string
  - medicamentoNome:    string
  - principioAtivo:     string
  - doseCalculada:      string
  - posologia:          string
  - via:                string
  - observacoes:        string
  - assinaturaBase64:   string
  - dataEmissao:        Timestamp
  - criadoEm:           Timestamp
```

---

# Parte VII — Firestore Security Rules

## 16. Regras completas (atualizar no console Firebase)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── HELPERS ─────────────────────────────────────────
    function isSignedIn()   { return request.auth != null; }
    function uid()          { return request.auth.uid; }
    function userData()     { return get(/databases/$(database)/documents/users/$(uid())).data; }
    function userRole()     { return userData().role; }
    function isAdmin()      { return isSignedIn() && userRole() == 'admin'; }
    function isDashboard()  { return isSignedIn() && userRole() == 'dashboard'; }
    function isVet()        { return isSignedIn() && userRole() == 'vet'; }
    function isVet2()       { return isSignedIn() && userRole() == 'vet2'; }
    function isEscritor()   { return isSignedIn() && userRole() == 'escritor'; }
    function isVetOrVet2()  { return isVet() || isVet2(); }

    // ── USERS ────────────────────────────────────────────
    match /users/{userId} {
      allow read:   if isSignedIn() && (uid() == userId || isAdmin() || isDashboard());
      allow create: if isSignedIn() && uid() == userId
                    && request.resource.data.role in ['vet', 'vet2']
                    && request.resource.data.approved == false
                    && request.resource.data.pontos == 0;
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    // ── CONFIG ───────────────────────────────────────────
    match /config/{doc} {
      allow read:  if isSignedIn();
      allow write: if isAdmin() || isDashboard();
    }

    // ── RESGATES ─────────────────────────────────────────
    match /resgates/{id} {
      allow read:   if isSignedIn() && (isAdmin() || isDashboard() || uid() == resource.data.vetUid);
      allow create: if isDashboard();
      allow update: if isAdmin();
      allow delete: if false;
    }

    // ── LIVRO — MEDICAMENTOS ─────────────────────────────
    match /livro/medicamentos/{id} {
      // Leitura de publicados: vet, vet2, escritor, admin
      allow read: if isSignedIn()
                  && (resource.data.status == 'publicado'
                      ? (isVet() || isVet2() || isEscritor() || isAdmin())
                      : (isEscritor() || isAdmin()));
      // Criação e edição: apenas escritor e admin
      allow create: if isEscritor() || isAdmin();
      allow update: if isEscritor() || isAdmin();
      allow delete: if isAdmin();
    }

    // ── RECEITUÁRIOS ─────────────────────────────────────
    match /receituarios/{id} {
      // Leitura pública para verificação de QR Code
      allow read: if true;
      // Criação: apenas vet (aprovado)
      allow create: if isVet() && userData().approved == true;
      // Ninguém edita ou deleta receituário após emissão
      allow update: if false;
      allow delete: if isAdmin();
    }
  }
}
```

---

# Parte VIII — Convenções de código

## 17. Padrões a preservar em todos os arquivos

| Convenção | Exemplo |
|---|---|
| Comentários de seção | `// ── NOME DA SEÇÃO ──────────────────────` |
| Funções e variáveis | Português: `mostrarViewLeitura()`, `carregarMedicamentos()` |
| Mensagens ao usuário | Português brasileiro, tom profissional |
| CSS variables | Centralizadas no `:root`, prefixo `--` |
| Classes CSS | BEM-like: `ficha__header`, `btn-sm--teal`, `status-badge--publicado` |
| Escape de HTML dinâmico | Sempre usar `esc()` antes de `innerHTML` |
| Módulos Firebase | ES Modules via CDN `gstatic.com/firebasejs/12.x.x/` |

## 18. Design system (CSS variables — preservar e estender)

```css
:root {
  /* Cores principais */
  --teal:         #3CB3C0;
  --teal-light:   #63cdd7;
  --teal-dark:    #1A7175;
  --teal-deep:    #145a5e;
  --teal-shadow:  #0f4548;

  /* Backgrounds */
  --bg:           #f4fbfc;
  --bg-warm:      #f8fdfd;
  --surface:      #ffffff;
  --surface-alt:  #f0f9fa;

  /* Bordas */
  --border-light: #ddeef0;
  --border:       #c8e2e5;

  /* Texto */
  --text:         #1A3A3D;
  --text-soft:    #4d7c80;
  --text-muted:   #8ab5b8;

  /* Tipografia */
  --font: 'Nunito', sans-serif;

  /* Sombras */
  --shadow-sm: 0 1px 3px rgba(20,90,94,0.06), 0 1px 2px rgba(20,90,94,0.04);
  --shadow-md: 0 4px 14px rgba(20,90,94,0.08), 0 2px 6px rgba(20,90,94,0.04);
  --shadow-lg: 0 12px 40px rgba(20,90,94,0.12), 0 4px 12px rgba(20,90,94,0.06);

  /* Extras para o Guia — adicionados */
  --sidebar-w:    300px;
  --header-h:     64px;
  --radius-card:  12px;
  --transition:   0.2s ease;
}
```

---

# Parte IX — Roadmap e pendências

## 19. Fase atual — O que será implementado agora

| # | Tarefa | Arquivo | Status |
|---|---|---|---|
| 1 | Criar `guia/index.html` — shell com views escritor e leitura | `guia/index.html` | 🔲 |
| 2 | Criar `guia/guia.js` — auth, roteamento, editor, busca, calculadora, receituário | `guia/guia.js` | 🔲 |
| 3 | Criar `guia/guia.css` — estilos do Guia | `guia/guia.css` | 🔲 |
| 4 | Criar `receituario/verificar.html` — verificação pública QR Code | `receituario/verificar.html` | 🔲 |
| 5 | Editar `app.js` — adicionar roteamento vet2/escritor + redirect | `app.js` | 🔲 |
| 6 | Editar `index.html` — adicionar card "Guia" na home-view do vet | `index.html` | 🔲 |
| 7 | Atualizar Firestore Security Rules no console Firebase | Firebase Console | 🔲 |

## 20. Pendências herdadas (Biovet Pontos)

| Pendência | Prioridade |
|---|---|
| Remover EmailJS e substituir por Firebase Extension (Trigger Email) | Média |
| Adicionar push notifications FCM para aprovação de cadastro | Baixa |
| Tela de onboarding via QR Code (`install.html`) | Baixa |

## 21. Roadmap futuro (Guia de Prescrição)

| Feature | Descrição |
|---|---|
| **Avaliações** | Vets avaliam fichas de medicamentos (1-5 estrelas + comentário) |
| **Admin gerencia livro** | Admin pode revisar rascunhos e despublicar fichas |
| **Exportar PDF do Guia** | Escritor exporta fichas selecionadas em PDF formatado |
| **Histórico de receituários** | Vet acessa lista dos receituários emitidos |
| **Notificação de novo medicamento** | Push FCM quando escritor publica nova ficha |
| **Internacionalização** | Suporte a espécies exóticas e calculadora avançada |

---

## 22. Checklist para o desenvolvedor antes de cada deploy

- [ ] Firestore Security Rules atualizadas no console
- [ ] Testar login com cada role: `admin`, `dashboard`, `vet`, `vet2`, `escritor`
- [ ] Testar redirect: `vet2` em `/` vai para `/guia/`
- [ ] Testar redirect: `escritor` em `/` vai para `/guia/`
- [ ] Testar `vet` vê card de acesso ao Guia na home
- [ ] Testar Gemini API com e sem PDF de referência
- [ ] Testar geração e leitura de QR Code de receituário
- [ ] Testar `/receituario/verificar.html?id=X` sem login
- [ ] Verificar que Service Worker não está fazendo cache stale de `/guia/`
- [ ] Testar PWA offline: Biovet Pontos funciona offline, Guia mostra mensagem adequada

---

*Documento mantido por: Equipe de Desenvolvimento Biovetfarma*
*Repositório: GitHub Pages — Privado (Plano Pro)*
*Domínio: `app.biovetfarma.com.br`*
*Firebase Project: `biovet-parceiro-vet`*
