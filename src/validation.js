function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateOnboardingPayload(body) {
  const errors = [];

  const payload = {
    nomeCompleto: normalizeString(body.nomeCompleto),
    emailPessoal: normalizeString(body.emailPessoal),
    cargo: normalizeString(body.cargo),
    departamento: normalizeString(body.departamento),
    gestor: normalizeString(body.gestor),
    dataAdmissao: normalizeString(body.dataAdmissao),
    tipoColaborador: normalizeString(body.tipoColaborador),
    serviceNowRequestId: normalizeString(body.serviceNowRequestId)
  };

  if (!payload.nomeCompleto) errors.push("nomeCompleto e obrigatorio.");
  if (!payload.cargo) errors.push("cargo e obrigatorio.");
  if (!payload.departamento) errors.push("departamento e obrigatorio.");
  if (!payload.gestor) errors.push("gestor e obrigatorio.");
  if (!payload.dataAdmissao) errors.push("dataAdmissao e obrigatorio.");
  if (!payload.tipoColaborador) errors.push("tipoColaborador e obrigatorio.");

  if (payload.emailPessoal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.emailPessoal)) {
    errors.push("emailPessoal invalido.");
  }

  if (payload.gestor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.gestor)) {
    errors.push("gestor deve ser um e-mail/UPN valido.");
  }

  if (payload.dataAdmissao && Number.isNaN(Date.parse(payload.dataAdmissao))) {
    errors.push("dataAdmissao deve estar em formato de data valido, preferencialmente YYYY-MM-DD.");
  }

  return { payload, errors };
}

module.exports = {
  validateOnboardingPayload
};
