const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// A URL é pública. A chave é mantida somente nos cofres do Firebase e do
// Supabase — nunca no JavaScript servido pelo GitHub Pages.
const supabaseUrl = defineString("SUPABASE_URL", {
  default: "https://piwsavppaabjygaolldb.supabase.co",
});
const webhookSecret = defineSecret("CASSOL_DASHBOARD_WEBHOOK_SECRET");
// As tarefas do Dashboard vivem em quatro documentos diferentes. Livros e
// projetos também precisam acordar o Checklist imediatamente; antes eles só
// sincronizavam quando algum cliente fazia uma consulta manual.
const watchedDocuments = new Set(["gc-events", "gc-conteudos", "gc-livros", "gc-projetos"]);
const knownRecipients = new Map([
  ["luiggi", "luiggi"],
  ["gisella", "gisella"],
  ["milena", "milena"],
]);

function parseStoredList(snapshot) {
  if (!snapshot?.exists) return [];
  try {
    const value = JSON.parse(String(snapshot.data()?.value || "[]"));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function addRecipient(target, value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("pt-BR");
  const recipient = knownRecipients.get(normalized);
  if (recipient) target.add(recipient);
}

function itemRecipients(documentId, item) {
  const recipients = new Set();
  if (documentId === "gc-events") addRecipient(recipients, item?.responsavel);
  if (documentId === "gc-conteudos") {
    Object.values(item?.etapasStatus || {}).forEach(stage => addRecipient(recipients, stage?.resp));
  }
  if (documentId === "gc-livros") {
    (item?.etapas || []).forEach(stage => addRecipient(recipients, stage?.resp || item?.responsavel));
  }
  if (documentId === "gc-projetos") {
    (item?.tarefas || []).forEach(task => addRecipient(recipients, task?.resp));
  }
  return recipients;
}

function changedRecipients(documentId, beforeSnapshot, afterSnapshot) {
  const beforeItems = parseStoredList(beforeSnapshot);
  const afterItems = parseStoredList(afterSnapshot);
  const beforeById = new Map(beforeItems.map(item => [String(item?.id || ""), item]));
  const afterById = new Map(afterItems.map(item => [String(item?.id || ""), item]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const recipients = new Set();

  ids.forEach(id => {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    itemRecipients(documentId, before).forEach(recipient => recipients.add(recipient));
    itemRecipients(documentId, after).forEach(recipient => recipients.add(recipient));
  });
  return [...recipients];
}

exports.syncChecklistOnDashboardChange = onDocumentWritten(
  {
    document: "dados/{documentId}",
    region: "southamerica-east1",
    secrets: [webhookSecret],
    maxInstances: 2,
  },
  async (event) => {
    const documentId = String(event.params.documentId || "");
    if (!watchedDocuments.has(documentId)) return;
    if (!event.data?.after.exists) return;

    // O Dashboard guarda a lista dentro do campo value. Se uma escrita não
    // mudou a lista de verdade, não acordamos o Supabase sem necessidade.
    const beforeValue = String(event.data.before.data()?.value || "");
    const afterValue = String(event.data.after.data()?.value || "");
    if (beforeValue === afterValue) return;
    const recipients = changedRecipients(documentId, event.data.before, event.data.after);

    const response = await fetch(`${supabaseUrl.value().replace(/\/$/, "")}/functions/v1/sync-cassol-dashboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cassol-dashboard-webhook": webhookSecret.value(),
      },
      body: JSON.stringify({
        operation: "dashboard_webhook",
        source_document: documentId,
        recipients,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new Error(`Supabase recusou a sincronização imediata (${response.status}): ${detail}`);
    }

    logger.info("Checklist notificado pelo Dashboard", { documentId, recipients });
  },
);
