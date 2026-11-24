/**
 * Load smoke test: 25 simulated players join, answer, then poll state and submit guesses
 * simultaneously. Reports observed latency and errors. This is a smoke test, not a capacity
 * guarantee; results depend on your machine, database plan and region.
 *
 *   BASE_URL=http://localhost:3000 HOST_PASSWORD=... npm run test:load
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PLAYERS = Number(process.env.PLAYERS ?? 25);
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 20);

type Client = { cookie: string; name: string };
const latencies: Record<string, number[]> = {};
const errors: Record<string, number> = {};

async function call(client: Client | null, label: string, path: string, init: RequestInit = {}) {
  const started = performance.now();
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(client?.cookie ? { Cookie: client.cookie } : {}), ...(init.headers ?? {}) },
  });
  (latencies[label] ??= []).push(performance.now() - started);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (client && setCookie.length) {
    client.cookie = [client.cookie, ...setCookie.map((c) => c.split(";")[0])].filter(Boolean).join("; ");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) errors[`${label} ${res.status}`] = (errors[`${label} ${res.status}`] ?? 0) + 1;
  return { status: res.status, body };
}

function pct(values: number[], p: number) {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}

async function main() {
  const host: Client = { cookie: "", name: "host" };
  const login = await call(host, "login", "/api/host/login", { method: "POST", body: JSON.stringify({ password: process.env.HOST_PASSWORD }) });
  if (login.status !== 200) throw new Error("Host login failed. Set HOST_PASSWORD.");
  const created = await call(host, "create", "/api/games", { method: "POST", body: JSON.stringify({ title: "Load test (sample data)", settings: { roundCount: 3, questionSeconds: 60 } }) });
  const code = created.body.code as string;
  console.log(`Game ${code}: joining ${PLAYERS} simulated players…`);

  const clients: Client[] = Array.from({ length: PLAYERS }, (_, i) => ({ cookie: "", name: `Load Tester ${i + 1}` }));
  await Promise.all(
    clients.map(async (c, i) => {
      await call(c, "join", `/api/games/${code}/join`, { method: "POST", body: JSON.stringify({ name: c.name }) });
      const answers = Array.from({ length: 8 }, (_, k) => ({ slot: k + 1, answer: `Sample answer ${k + 1}-${i}` }));
      await call(c, "answers", `/api/games/${code}/questionnaire`, { method: "PATCH", body: JSON.stringify({ answers }) });
      await call(c, "ready", `/api/games/${code}/ready`, { method: "POST", body: JSON.stringify({ ready: true }) });
    }),
  );

  await call(host, "start", `/api/games/${code}/start`, { method: "POST", body: JSON.stringify({ excludeUnready: true }) });
  let state = (await call(host, "state-host", `/api/games/${code}/state?view=host`)).body;
  await call(host, "action", `/api/games/${code}/action`, { method: "POST", body: JSON.stringify({ action: "open", expectedVersion: state.version }) });
  state = (await call(host, "state-host", `/api/games/${code}/state?view=host`)).body;
  const roundId = state.round.id as string;
  const optionId = state.round.options[0].id as string;
  console.log(`Polling for ${POLL_SECONDS}s with ${PLAYERS} players (~1.5s interval) and submitting guesses…`);

  const until = Date.now() + POLL_SECONDS * 1000;
  let sizeSample = 0;
  await Promise.all(
    clients.map(async (c, i) => {
      let guessed = false;
      await new Promise((r) => setTimeout(r, (i * 1500) / PLAYERS));
      while (Date.now() < until) {
        const s = await call(c, "state-player", `/api/games/${code}/state?view=player`);
        if (!sizeSample && s.body) sizeSample = JSON.stringify(s.body).length;
        if (!guessed && Date.now() > until - POLL_SECONDS * 500) {
          guessed = true;
          await call(c, "guess", `/api/games/${code}/guess`, { method: "POST", body: JSON.stringify({ roundId, optionId }) });
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }),
  );

  state = (await call(host, "state-host", `/api/games/${code}/state?view=host`)).body;
  console.log(`Answered: ${state.round.answeredCount}/${state.round.eligibleCount}`);
  await call(host, "action", `/api/games/${code}/action`, { method: "POST", body: JSON.stringify({ action: "reveal", expectedVersion: state.version }) });
  await call(host, "delete", `/api/games/${code}`, { method: "DELETE" });

  console.log("\nlabel            count    p50ms    p95ms    maxms");
  for (const [label, v] of Object.entries(latencies)) {
    console.log(`${label.padEnd(16)} ${String(v.length).padStart(5)} ${pct(v, 50).toFixed(0).padStart(8)} ${pct(v, 95).toFixed(0).padStart(8)} ${Math.max(...v).toFixed(0).padStart(8)}`);
  }
  console.log(`\nPlayer state payload: ~${sizeSample} bytes`);
  // "guess 409" responses would mean a player's guess was rejected as late or duplicated.
  console.log("Errors:", Object.keys(errors).length ? errors : "none");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
