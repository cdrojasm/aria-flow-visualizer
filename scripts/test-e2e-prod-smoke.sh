#!/usr/bin/env bash
set -euo pipefail

env_file="${E2E_ENV_FILE:-.env.e2e.prod}"
if [[ ! -f "$env_file" ]]; then
  echo "No encuentro $env_file; crea el archivo local con las siete credenciales requeridas." >&2
  exit 2
fi

set -a
source "$env_file"
set +a

if [[ -z "${ARIA_E2E_BASE_URL:-}" ]]; then
  printf 'URL del entorno (ARIA_E2E_BASE_URL): '
  IFS= read -r ARIA_E2E_BASE_URL
  [[ -n "$ARIA_E2E_BASE_URL" ]] || { echo "La URL es obligatoria; no se ejecutaron tests." >&2; exit 2; }
  export ARIA_E2E_BASE_URL
fi

roles=(MANAGER CHANNEL_MANAGER RELEASE_MANAGER DATA_ANALYST FRAUD_ANALYST OPS_ANALYST FRAUD_REVIEWER)
for role in "${roles[@]}"; do
  for suffix in EMAIL PASSWORD; do
    key="E2E_${role}_${suffix}"
    if [[ -z "${!key:-}" ]]; then
      echo "Falta $key en $env_file; no se ejecutaron tests." >&2
      exit 2
    fi
  done
done

echo "Credenciales cargadas para los siete roles desde $env_file."

echo
echo "Validando las siete credenciales antes de iniciar los tests."
node --input-type=module -e '
import { request } from "@playwright/test";
const roles = ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER", "DATA_ANALYST", "FRAUD_ANALYST", "OPS_ANALYST", "FRAUD_REVIEWER"];
const api = await request.newContext({
  baseURL: process.env.ARIA_E2E_BASE_URL,
  ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === "1",
});
try {
  for (const role of roles) {
    const response = await api.post("/api/v0/auth/login", {
      data: {
        email: process.env[`E2E_${role}_EMAIL`],
        password: process.env[`E2E_${role}_PASSWORD`],
      },
    });
    if (!response.ok()) {
      console.error(`Credenciales inválidas o rol no habilitado: ${role} (HTTP ${response.status()}). No se ejecutaron tests.`);
      process.exitCode = 1;
      break;
    }
    console.log(`Credenciales válidas: ${role}`);
  }
} finally {
  await api.dispose();
}
'
echo
echo "Credenciales completas y válidas. Iniciando una sola ejecución de smoke E2E."
E2E_PLAYWRIGHT_WORKERS=1 npm run test:e2e:prod-smoke
