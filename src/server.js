require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const { validateOnboardingPayload } = require("./validation");
const { runOnboardingScript } = require("./powershellRunner");
const { buildManagerEmail, sendManagerNotification } = require("./mailService");
const {
  insertNotificationAttempt,
  updateNotificationAfterSend,
  getNotificationById,
  listNotifications,
  parseNotificationRecord
} = require("./database");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

function requireApiKey(req, res, next) {
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({
      status: "Falha",
      mensagemErro: "API_KEY nao configurada no .env."
    });
  }

  const receivedApiKey = req.header("x-api-key");

  if (receivedApiKey !== expectedApiKey) {
    return res.status(401).json({
      status: "Falha",
      mensagemErro: "Chave de API invalida."
    });
  }

  next();
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "exchange-user-lab-api"
  });
});

app.post("/api/onboarding/users", requireApiKey, async (req, res) => {
  const { payload, errors } = validateOnboardingPayload(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      status: "Falha",
      mensagemErro: errors.join(" ")
    });
  }

  try {
    const result = await runOnboardingScript(payload);
    const message = buildManagerEmail(payload, result);
    let notification;

    try {
      notification = await sendManagerNotification(payload, result);
    } catch (error) {
      notification = {
        sent: false,
        mensagemErro: error.message
      };
    }

    const notificationRecord = insertNotificationAttempt({
      payload,
      result,
      subject: message.subject,
      notification
    });

    return res.status(201).json({
      ...result,
      notificacaoGestor: {
        ...notification,
        id: notificationRecord.id,
        status: notificationRecord.status,
        attempts: notificationRecord.attempts
      }
    });
  } catch (error) {
    const result = error.result || {
      status: "Falha",
      serviceNowRequestId: payload.serviceNowRequestId,
      nomeCompleto: payload.nomeCompleto,
      upnCriado: null,
      senhaInicial: null,
      mensagemErro: error.message
    };

    return res.status(500).json({
      ...result,
      detalheTecnico: process.env.NODE_ENV === "production" ? undefined : {
        stdout: error.stdout,
        stderr: error.stderr
      }
    });
  }
});

app.get("/api/notifications", requireApiKey, (req, res) => {
  const notifications = listNotifications({
    status: req.query.status,
    limit: req.query.limit
  });

  res.json({
    status: "ok",
    items: notifications
  });
});

app.post("/api/notifications/:id/resend", requireApiKey, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      status: "Falha",
      mensagemErro: "Id de notificacao invalido."
    });
  }

  const record = getNotificationById(id);

  if (!record) {
    return res.status(404).json({
      status: "Falha",
      mensagemErro: "Notificacao nao encontrada."
    });
  }

  const notification = parseNotificationRecord(record);

  try {
    const sendResult = await sendManagerNotification(notification.payload, notification.result);
    const updated = updateNotificationAfterSend(id, sendResult);

    res.json({
      status: "ok",
      notificacaoGestor: updated
    });
  } catch (error) {
    const updated = updateNotificationAfterSend(id, {
      sent: false,
      mensagemErro: error.message
    });

    res.status(502).json({
      status: "Falha",
      notificacaoGestor: updated
    });
  }
});

app.post("/api/notifications/resend-failed", requireApiKey, async (req, res) => {
  const failedNotifications = listNotifications({
    status: "failed",
    limit: req.query.limit || 50
  });
  const results = [];

  for (const item of failedNotifications) {
    const record = getNotificationById(item.id);
    const notification = parseNotificationRecord(record);

    try {
      const sendResult = await sendManagerNotification(notification.payload, notification.result);
      results.push(updateNotificationAfterSend(item.id, sendResult));
    } catch (error) {
      results.push(updateNotificationAfterSend(item.id, {
        sent: false,
        mensagemErro: error.message
      }));
    }
  }

  res.json({
    status: "ok",
    total: results.length,
    items: results
  });
});

app.use((req, res) => {
  res.status(404).json({
    status: "Falha",
    mensagemErro: "Rota nao encontrada."
  });
});

app.listen(port, () => {
  console.log(`exchange-user-lab-api listening on http://localhost:${port}`);
});
