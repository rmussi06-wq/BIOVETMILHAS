const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ── HELPER — resolve tokens FCM dos destinatários ─────────────────────────────
async function resolverTokens(destinatarioUid, destinatarioRole) {
  const tokens = [];

  if (destinatarioUid) {
    // Notificação para usuário específico
    const snap = await db.collection('users').doc(destinatarioUid).get();
    if (snap.exists) {
      const fcmTokens = snap.data().fcmTokens || [];
      tokens.push(...fcmTokens);
    }
  } else if (destinatarioRole) {
    // Broadcast para todos os usuários de uma role
    const snap = await db.collection('users')
      .where('role', '==', destinatarioRole)
      .get();
    snap.docs.forEach(d => {
      const fcmTokens = d.data().fcmTokens || [];
      tokens.push(...fcmTokens);
    });
  }

  // Remove duplicatas
  return [...new Set(tokens)];
}

// ── HELPER — limpa tokens inválidos ──────────────────────────────────────────
async function removerTokensInvalidos(destinatarioUid, destinatarioRole, tokensInvalidos) {
  if (!tokensInvalidos.length) return;

  const query = destinatarioUid
    ? db.collection('users').where('__name__', '==', destinatarioUid)
    : db.collection('users').where('role', '==', destinatarioRole);

  const snap = await query.get();
  const batch = db.batch();

  snap.docs.forEach(d => {
    const atuais   = d.data().fcmTokens || [];
    const filtrados = atuais.filter(t => !tokensInvalidos.includes(t));
    if (filtrados.length !== atuais.length) {
      batch.update(d.ref, { fcmTokens: filtrados });
    }
  });

  await batch.commit().catch(err => console.error('removerTokens:', err));
}

// ── TRIGGER — envia push quando notificacao é criada ─────────────────────────
exports.enviarPushNotificacao = onDocumentCreated(
  'notificacoes/{id}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const {
      destinatarioUid  = null,
      destinatarioRole = null,
      titulo           = 'Biovetfarma',
      mensagem         = ''
    } = snap.data();

    // Resolve tokens dos destinatários
    const tokens = await resolverTokens(destinatarioUid, destinatarioRole);
    if (!tokens.length) {
      console.log('Nenhum token FCM para enviar push.');
      return;
    }

    // Envia push via FCM
    const multicast = {
      notification: { title: titulo, body: mensagem },
      webpush: {
        notification: {
          icon:  'https://app.biovetfarma.com.br/icons/icon-192.png',
          badge: 'https://app.biovetfarma.com.br/icons/icon-192.png',
          requireInteraction: false
        },
        fcmOptions: { link: 'https://app.biovetfarma.com.br/' }
      },
      tokens
    };

    try {
      const resultado = await messaging.sendEachForMulticast(multicast);
      console.log(`Push enviado: ${resultado.successCount} ok, ${resultado.failureCount} falhas`);

      // Remove tokens inválidos (expirados ou desinstalados)
      const invalidos = resultado.responses
        .map((r, i) => (!r.success && r.error?.code === 'messaging/registration-token-not-registered') ? tokens[i] : null)
        .filter(Boolean);

      if (invalidos.length) {
        await removerTokensInvalidos(destinatarioUid, destinatarioRole, invalidos);
        console.log(`${invalidos.length} token(s) inválido(s) removido(s).`);
      }
    } catch (err) {
      console.error('Erro ao enviar push:', err);
    }
  }
);
