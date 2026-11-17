// Validation des données : schéma, dates réelles, doublons d'id, cohérence des périodes, distances, références des infos non abouties.
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

// Distance à vol d'oiseau depuis la place de la Comédie, la rubrique se limitant à 50 km.
const ORIGIN = { lat: 43.6086, lon: 3.8797 };
const MAX_KM = 50;
const distanceKm = (lat, lon) => {
  const rad = (x) => x * Math.PI / 180;
  const a = Math.sin(rad(lat - ORIGIN.lat) / 2) ** 2
    + Math.cos(rad(ORIGIN.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lon - ORIGIN.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

const activities = check("activities.json", "items", "items", (it, fail) => {
  for (const k of ["start", "end"]) {
    if (it[k] && !isRealDate(it[k])) fail(`${k} invalide (${it[k]})`);
  }
  if (it.end && !it.start) fail("end sans start");
  if (it.end && it.start > it.end) fail("start après end");
  if (it.at) {
    if (!isRealDateTime(it.at)) fail(`horaire invalide (${it.at})`);
    else if (!it.start || it.at.slice(0, 10) < it.start || it.at.slice(0, 10) > (it.end || it.start)) fail(`horaire hors des dates (${it.at})`);
  }
  if (it.result && (!it.start || (it.end || it.start) >= new Date().toISOString().slice(0, 10))) fail("résultat sur un événement non terminé");
  if (it.result && it.type !== "sport") fail("result réservé au sport");
  if (typeof it.lat === "number" && typeof it.lon === "number") {
    const km = distanceKm(it.lat, it.lon);
    if (km > MAX_KM) fail(`à ${km.toFixed(1)} km de Montpellier (${MAX_KM} km au plus)`);
  }
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK : ${events} événements, ${screens} films et séries et ${activities} activités valides`);
