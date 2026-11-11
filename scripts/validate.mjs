// Validation de events.json : schéma, dates réelles, doublons d'id, start <= end, références des infos non abouties.
import { readFileSync } from "node:fs";
import Ajv from "ajv";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const data = read("../events.json");
const events = Array.isArray(data?.events) ? data.events : [];
const schema = read("../events.schema.json");

const errors = [];
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
if (!validate(data)) {
  for (const e of validate.errors) errors.push(`schéma ${e.instancePath} ${e.message}`);
}

const isRealDate = (s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

if (data?.updated && !isRealDate(data.updated)) errors.push(`updated invalide (${data.updated})`);

const isRealDateTime = (s) => isRealDate(s.slice(0, 10)) && !Number.isNaN(new Date(s).getTime());

const seen = new Set();
for (const ev of events) {
  if (seen.has(ev.id)) errors.push(`id en double : ${ev.id}`);
  seen.add(ev.id);
  for (const k of ["start", "end"]) {
    if (ev[k] && !isRealDate(ev[k])) errors.push(`${ev.id} : ${k} invalide (${ev[k]})`);
  }
  if (ev.end && ev.start > ev.end) errors.push(`${ev.id} : start après end`);
  for (const m of ev.participants?.matches ?? []) {
    if (m.date && !isRealDate(m.date)) errors.push(`${ev.id} : date d'affiche invalide (${m.date})`);
    if (m.at && !isRealDateTime(m.at)) errors.push(`${ev.id} : horaire d'affiche invalide (${m.at})`);
  }
  for (const s of ev.schedule ?? []) {
    if (!isRealDateTime(s.at)) errors.push(`${ev.id} : horaire invalide (${s.at})`);
  }
}

const pendingIds = new Set();
for (const p of Array.isArray(data?.pending) ? data.pending : []) {
  if (pendingIds.has(p.id)) errors.push(`pending : id en double : ${p.id}`);
  pendingIds.add(p.id);
  for (const id of p.events ?? []) {
    if (!seen.has(id)) errors.push(`pending ${p.id} : événement inconnu (${id})`);
  }
  if (p.since && !isRealDate(p.since)) errors.push(`pending ${p.id} : since invalide (${p.since})`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK : ${events.length} événements valides`);
