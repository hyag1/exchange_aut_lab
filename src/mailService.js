const nodemailer = require("nodemailer");

function shouldSendEmail() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    getMailFromAddress()
  );
}

function getMailFromAddress() {
  return process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || "";
}

function getMailFrom() {
  const address = getMailFromAddress();
  const name = process.env.MAIL_FROM_NAME || "Onboarding Microsoft 365";

  return {
    name,
    address
  };
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function buildManagerEmail(payload, result) {
  const subject = `Conta Microsoft 365 criada - ${result.nomeCompleto}`;

  const text = [
    `Ola,`,
    ``,
    `A conta Microsoft 365 do novo colaborador foi criada.`,
    ``,
    `Colaborador: ${result.nomeCompleto}`,
    `Cargo: ${payload.cargo}`,
    `Departamento: ${payload.departamento}`,
    `UPN/E-mail: ${result.upnCriado}`,
    `Senha provisoria: ${result.senhaInicial}`,
    `Licenca: ${result.licencaAtribuida}`,
    `Solicitacao ServiceNow: ${payload.serviceNowRequestId || "Nao informado"}`,
    ``,
    `Oriente o colaborador a acessar o portal Microsoft 365 e trocar a senha no primeiro acesso, se essa politica estiver ativa no tenant.`,
    ``,
    `Mensagem gerada automaticamente pela API de onboarding.`
  ].join("\n");

  const html = `
    <p>Ola,</p>
    <p>A conta Microsoft 365 do novo colaborador foi criada.</p>
    <table cellpadding="6" cellspacing="0" border="1">
      <tr><td><strong>Colaborador</strong></td><td>${result.nomeCompleto}</td></tr>
      <tr><td><strong>Cargo</strong></td><td>${payload.cargo}</td></tr>
      <tr><td><strong>Departamento</strong></td><td>${payload.departamento}</td></tr>
      <tr><td><strong>UPN/E-mail</strong></td><td>${result.upnCriado}</td></tr>
      <tr><td><strong>Senha provisoria</strong></td><td>${result.senhaInicial}</td></tr>
      <tr><td><strong>Licenca</strong></td><td>${result.licencaAtribuida}</td></tr>
      <tr><td><strong>Solicitacao ServiceNow</strong></td><td>${payload.serviceNowRequestId || "Nao informado"}</td></tr>
    </table>
    <p>Oriente o colaborador a acessar o portal Microsoft 365 e trocar a senha no primeiro acesso, se essa politica estiver ativa no tenant.</p>
    <p>Mensagem gerada automaticamente pela API de onboarding.</p>
  `;

  return { subject, text, html };
}

async function sendManagerNotification(payload, result) {
  if (!shouldSendEmail()) {
    return {
      sent: false,
      reason: "SMTP nao configurado. Preencha SMTP_HOST, SMTP_USER, SMTP_PASS e MAIL_FROM_ADDRESS no .env."
    };
  }

  const transporter = createTransporter();
  const message = buildManagerEmail(payload, result);

  const info = await transporter.sendMail({
    from: getMailFrom(),
    to: payload.gestor,
    subject: message.subject,
    text: message.text,
    html: message.html
  });

  return {
    sent: true,
    messageId: info.messageId
  };
}

module.exports = {
  buildManagerEmail,
  sendManagerNotification
};
