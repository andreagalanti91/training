// Avvia il Supabase simulato, esegue i test end-to-end e lo chiude.
import { spawn } from "node:child_process";
const port = 8790 + Math.floor(Math.random() * 100);
const srv = spawn(process.execPath, ["tests/mock-server.mjs", String(port)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise(r => srv.stdout.once("data", r));
const t = spawn(process.execPath, ["tests/e2e.mjs", `http://localhost:${port}`, ...process.argv.slice(2)], { stdio: "inherit" });
t.on("exit", code => { srv.kill(); process.exit(code ?? 1); });
