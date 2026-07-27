const { spawn } = require("node:child_process");
const path = require("node:path");

function buildPowerShellArgs(payload) {
  const scriptPath = process.env.ONBOARDING_SCRIPT_PATH ||
    path.join(process.cwd(), "Create-LabMailboxUser.ps1");
  const configPath = process.env.POWERSHELL_CONFIG_PATH ||
    path.join(path.dirname(scriptPath), "config.local.ps1");

  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-NomeCompleto",
    payload.nomeCompleto,
    "-EmailPessoal",
    payload.emailPessoal || "",
    "-Cargo",
    payload.cargo || "",
    "-Departamento",
    payload.departamento || "",
    "-Gestor",
    payload.gestor || "",
    "-DataAdmissao",
    payload.dataAdmissao || "",
    "-TipoColaborador",
    payload.tipoColaborador || "",
    "-ServiceNowRequestId",
    payload.serviceNowRequestId || "",
    "-ConfigPath",
    configPath
  ];

  if ((process.env.SKIP_MAILBOX_CHECK || "true").toLowerCase() === "true") {
    args.push("-SkipMailboxCheck");
  }

  return args;
}

function extractJson(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`A execucao PowerShell nao retornou JSON valido. Saida: ${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function runOnboardingScript(payload) {
  return new Promise((resolve, reject) => {
    const powershellExe = process.env.POWERSHELL_EXE || "powershell.exe";
    const child = spawn(powershellExe, buildPowerShellArgs(payload), {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString("utf8");
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString("utf8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      try {
        const result = extractJson(stdout);

        if (code !== 0 || result.status === "Falha") {
          const error = new Error(result.mensagemErro || stderr || `PowerShell finalizou com codigo ${code}.`);
          error.result = result;
          return reject(error);
        }

        resolve(result);
      } catch (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

module.exports = {
  runOnboardingScript
};
