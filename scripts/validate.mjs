// Validation de events.json : schéma, doublons d'id, dates réelles, start <= end.
import { readFileSync } from "node:fs";
import Ajv from "ajv";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const events = read("../events.json");
const schema = read("../events.schema.json");

const errors = [];
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
if (!validate(events)) {
  for (const e of validate.errors) errors.push(`schéma ${e.instancePath} ${e.message}`);
}

const isRealDate = (s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const seen = new Set();
for (const ev of Array.isArray(events) ? events : []) {
  if (seen.has(ev.id)) errors.push(`id en double : ${ev.id}`);
  seen.add(ev.id);
  for (const k of ["start", "end"]) {
    if (ev[k] && !isRealDate(ev[k])) errors.push(`${ev.id} : ${k} invalide (${ev[k]})`);
  }
  if (ev.end && ev.start > ev.end) errors.push(`${ev.id} : start après end`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK : ${events.length} événements valides`);
