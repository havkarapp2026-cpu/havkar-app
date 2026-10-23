const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const binDir = "/usr/lib/postgresql/18/bin";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "havkar-stellar-rls-"));
const port = "55443";
const env = Object.assign({}, process.env, {
  PGHOST: dataDir,
  PGPORT: port,
  PGUSER: "ubuntu",
  PGDATABASE: "postgres",
  PGSSLMODE: "disable",
  PGPASSWORD: ""
});

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    env
  });
}

let started = false;

try {
  run(path.join(binDir, "initdb"), [
    "-D", dataDir,
    "--auth=trust",
    "--username=ubuntu",
    "--no-instructions"
  ]);
  run(path.join(binDir, "pg_ctl"), [
    "-D", dataDir,
    "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`,
    "-l", path.join(dataDir, "server.log"),
    "start"
  ]);
  started = true;
  const applied = run("psql", [
    "-h", dataDir,
    "-p", port,
    "-U", "ubuntu",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-f", "tests/stellar-payment-prelude.sql",
    "-f", "supabase/migrations/20261023150000_stellar_payment_controls.sql",
    "-f", "tests/stellar-payment-rls.sql"
  ]);
  assert.match(applied, /other_user_rows\s*\n[-+]+\n\s*0/);
  assert.match(applied, /owner_rows\s*\n[-+]+\n\s*1/);
  assert.match(applied, /STELLAR_PAYMENT_RLS_OK/);
  assert.doesNotMatch(applied, /ERROR:/);
  console.log("STELLAR_PAYMENT_RLS_OK");
} finally {
  if (started) {
    try {
      run(path.join(binDir, "pg_ctl"), ["-D", dataDir, "stop", "-m", "fast"]);
    } catch (error) {
      console.warn(error && error.message);
    }
  }
}
