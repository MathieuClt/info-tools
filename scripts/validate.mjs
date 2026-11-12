// Validation des données : schéma, dates réelles, doublons d'id, cohérence des périodes, références des infos non abouties.
import { readFileSync } from "node:fs";
import Ajv from "ajv";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ajv = new Ajv({ allErrors: true });
const errors = [];

const isRealDate = (s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const isRealDateTime = (s) => isRealDate(s.slice(0, 10)) && !Number.isNaN(new Date(s).getTime());

// Contrôles communs : schéma, date de mise à jour, ids uniques, infos non abouties rattachées à des ids connus.
function check(file, listKey, refKey, perItem) {
  const data = read(`../${file}`);
  const validate = ajv.compile(read(`../${file.replace(".json", ".schema.json")}`));
  if (!validate(data)) {
    for (const e of validate.errors) errors.push(`${file} : schéma ${e.instancePath} ${e.message}`);
  }
  if (data?.updated && !isRealDate(data.updated)) errors.push(`${file} : updated invalide (${data.updated})`);

  const list = Array.isArray(data?.[listKey]) ? data[listKey] : [];
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.id)) errors.push(`${file} : id en double : ${item.id}`);
    seen.add(item.id);
    perItem(item, (msg) => errors.push(`${file} : ${item.id} : ${msg}`));
  }

  const pendingIds = new Set();
  for (const p of Array.isArray(data?.pending) ? data.pending : []) {
    if (pendingIds.has(p.id)) errors.push(`${file} : pending : id en double : ${p.id}`);
    pendingIds.add(p.id);
    for (const id of p[refKey] ?? []) {
      if (!seen.has(id)) errors.push(`${file} : pending ${p.id} : id inconnu (${id})`);
    }
    if (p.since && !isRealDate(p.since)) errors.push(`${file} : pending ${p.id} : since invalide (${p.since})`);
  }
  return list.length;
}

const events = check("events.json", "events", "events", (ev, fail) => {
  for (const k of ["start", "end"]) {
    if (ev[k] && !isRealDate(ev[k])) fail(`${k} invalide (${ev[k]})`);
  }
  if (ev.end && ev.start > ev.end) fail("start après end");
  for (const m of ev.participants?.matches ?? []) {
    if (m.date && !isRealDate(m.date)) fail(`date d'affiche invalide (${m.date})`);
    if (m.at && !isRealDateTime(m.at)) fail(`horaire d'affiche invalide (${m.at})`);
  }
  for (const s of ev.schedule ?? []) {
    if (!isRealDateTime(s.at)) fail(`horaire invalide (${s.at})`);
  }
});

const screens = check("screens.json", "items", "items", (it, fail) => {
  for (const k of ["release", "releaseEnd"]) {
    if (it[k] && !isRealDate(it[k])) fail(`${k} invalide (${it[k]})`);
  }
  if (it.releaseEnd && it.release > it.releaseEnd) fail("release après releaseEnd");
  if (it.releaseEnd && it.type !== "serie") fail("releaseEnd réservé aux séries");
  if (it.season && it.type !== "serie") fail("season réservé aux séries");
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK : ${events} événements et ${screens} films et séries valides`);
