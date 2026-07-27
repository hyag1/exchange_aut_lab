const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const defaultDbPath = path.join(process.cwd(), "data", "exchange-user-lab.sqlite");
const dbPath = process.env.SQLITE_DB_PATH || defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_now_request_id TEXT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    message_id TEXT,
    error_message TEXT,
    payload_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_email_notifications_status
    ON email_notifications(status);

  CREATE INDEX IF NOT EXISTS idx_email_notifications_service_now_request_id
    ON email_notifications(service_now_request_id);
`);

function insertNotificationAttempt({ payload, result, subject, notification }) {
  const sent = Boolean(notification && notification.sent);
  const statement = db.prepare(`
    INSERT INTO email_notifications (
      service_now_request_id,
      recipient,
      subject,
      status,
      message_id,
      error_message,
      payload_json,
      result_json,
      attempts,
      sent_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
  `);

  const insertResult = statement.run(
    payload.serviceNowRequestId || null,
    payload.gestor,
    subject,
    sent ? "sent" : "failed",
    notification && notification.messageId ? notification.messageId : null,
    notification && (notification.mensagemErro || notification.reason) ? (notification.mensagemErro || notification.reason) : null,
    JSON.stringify(payload),
    JSON.stringify(result),
    sent ? 1 : 0
  );

  return getNotificationById(Number(insertResult.lastInsertRowid));
}

function updateNotificationAfterSend(id, notification) {
  const sent = Boolean(notification && notification.sent);
  const existing = getNotificationById(id);

  if (!existing) {
    return null;
  }

  const statement = db.prepare(`
    UPDATE email_notifications
    SET
      status = ?,
      message_id = ?,
      error_message = ?,
      attempts = attempts + 1,
      updated_at = CURRENT_TIMESTAMP,
      sent_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE sent_at END
    WHERE id = ?
  `);

  statement.run(
    sent ? "sent" : "failed",
    notification && notification.messageId ? notification.messageId : null,
    notification && (notification.mensagemErro || notification.reason) ? (notification.mensagemErro || notification.reason) : null,
    sent ? 1 : 0,
    id
  );

  return getNotificationById(id);
}

function getNotificationById(id) {
  return db.prepare(`
    SELECT
      id,
      service_now_request_id AS serviceNowRequestId,
      recipient,
      subject,
      status,
      message_id AS messageId,
      error_message AS errorMessage,
      payload_json AS payloadJson,
      result_json AS resultJson,
      attempts,
      created_at AS createdAt,
      updated_at AS updatedAt,
      sent_at AS sentAt
    FROM email_notifications
    WHERE id = ?
  `).get(id);
}

function listNotifications({ status, limit = 50 }) {
  const maxRows = Math.min(Math.max(Number(limit) || 50, 1), 200);

  if (status) {
    return db.prepare(`
      SELECT
        id,
        service_now_request_id AS serviceNowRequestId,
        recipient,
        subject,
        status,
        message_id AS messageId,
        error_message AS errorMessage,
        attempts,
        created_at AS createdAt,
        updated_at AS updatedAt,
        sent_at AS sentAt
      FROM email_notifications
      WHERE status = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(status, maxRows);
  }

  return db.prepare(`
    SELECT
      id,
      service_now_request_id AS serviceNowRequestId,
      recipient,
      subject,
      status,
      message_id AS messageId,
      error_message AS errorMessage,
      attempts,
      created_at AS createdAt,
      updated_at AS updatedAt,
      sent_at AS sentAt
    FROM email_notifications
    ORDER BY id DESC
    LIMIT ?
  `).all(maxRows);
}

function parseNotificationRecord(record) {
  return {
    ...record,
    payload: JSON.parse(record.payloadJson),
    result: JSON.parse(record.resultJson),
    payloadJson: undefined,
    resultJson: undefined
  };
}

module.exports = {
  insertNotificationAttempt,
  updateNotificationAfterSend,
  getNotificationById,
  listNotifications,
  parseNotificationRecord
};
