const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// A URL é pública. A chave é mantida somente nos cofres do Firebase e do
// Supabase — nunca no JavaScript servido pelo GitHub Pages.
const supabaseUrl = defineString("SUPABASE_URL", {
  default: "https://piwsavppaabjygaolldb.supabase.co",
});
const webhookSecret = defineSecret("CASSOL_DASHBOARD_WEBHOOK_SECRET");
const watchedDocuments = new Set(["gc-events", "gc-conteudos"]);

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

    const response = await fetch(`${supabaseUrl.value().replace(/\/$/, "")}/functions/v1/sync-cassol-dashboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cassol-dashboard-webhook": webhookSecret.value(),
      },
      body: JSON.stringify({
        operation: "dashboard_webhook",
        source_document: documentId,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new Error(`Supabase recusou a sincronização imediata (${response.status}): ${detail}`);
    }

    logger.info("Checklist notificado pelo Dashboard", { documentId });
  },
);
