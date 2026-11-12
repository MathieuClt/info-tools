"use strict";

// Rubrique Films & séries : sorties cinéma et plateformes en France (screens.json).
const TYPE_LABEL = { film: "Film", serie: "Série" };
const STORAGE_KEY = "genres-selection";
const RECENT_DAYS = 30;
// Plateformes toujours proposées dans le filtre « Où regarder », complétées par celles trouvées dans les données.
const PLATFORMS = [
  { label: "Cinéma", names: ["Cinéma"] },
  { label: "Plateformes de streaming", names: ["Netflix", "Prime Video", "Disney+", "HBO Max", "Apple TV+", "Canal+", "Paramount+", "Crunchyroll"] },
  { label: "Chaînes TV et replay", names: ["France TV", "TF1", "M6", "Arte"] },
];

const state = { items: [], pending: [], updated: null, genres: [], selected: new Set(), pendingGroup: null };

// upcoming : pas encore sorti ; airing : série en cours de diffusion ; released : sorti.
function screenStatus(it, now) {
  if (it.release > now) return "upcoming";
  if (it.type === "serie" && it.releaseEnd && it.releaseEnd >= now) return "airing";
  return "released";
}

function shiftDays(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function kindLabel(it) {
  return TYPE_LABEL[it.type] + (it.season ? ` · saison ${it.season}` : "");
}

function asEvent(it) {
  return { start: it.release, end: it.releaseEnd || it.release };
}

function whereLine(it) {
  const line = el("div", "tv");
  line.appendChild(el("span", "tv-label", "OÙ"));
  const list = it.where || [];
  if (!list.length) {
    line.appendChild(el("span", "tv-none", "diffusion en France non confirmée"));
    return line;
  }
  list.forEach((w) => {
    const unsure = w.confirmed === false;
    const a = link(w.source, w.name + (unsure ? " ?" : ""), `tv-name w-${w.kind}` + (w.free ? " is-free" : "") + (unsure ? " is-unconfirmed" : ""));
    a.title = (unsure ? "Non confirmé · " : "") + (w.kind === "cinema" ? "En salle" : w.free ? "Gratuit" : "Abonnement");
    line.appendChild(a);
  });
  if (list.some((w) => w.confirmed === false)) line.appendChild(el("span", "unsure-hint", "? non confirmé"));
  return line;
}

function card(it, status, opts) {
  const li = el("li", `event t-${it.type} is-${status}`);
  li.appendChild(dateBlock(asEvent(it), opts.withYear));

  const body = el("div", "body");
  body.appendChild(el("span", "sr-only", dateLabel(asEvent(it))));
  const kicker = el("div", "kicker");
  kicker.appendChild(el("span", "sport", kindLabel(it)));
  if (status === "airing") kicker.appendChild(el("span", "badge ongoing", "En diffusion"));
  if (it.tentative) kicker.appendChild(el("span", "badge tentative", "Date non fixée"));
  body.appendChild(kicker);

  const title = el("h3", "name");
  title.appendChild(link(it.url, it.title));
  body.appendChild(title);
  if (it.originalTitle) body.appendChild(el("p", "original", it.originalTitle));
  if (it.genres?.length) body.appendChild(el("p", "place", it.genres.join(" · ")));

  const people = it.people || {};
  const credits = el("dl", "credits");
  const add = (label, names) => {
    if (!names?.length) return;
    credits.append(el("dt", "", label), el("dd", "", names.join(", ")));
  };
  add("Réalisation", people.directors);
  add("Création", people.creators);
  add("Avec", people.cast);
  if (credits.childNodes.length) body.appendChild(credits);

  body.appendChild(whereLine(it));
  const src = el("p", "sources");
  src.append("Source : ");
  src.appendChild(link(it.source, "date de sortie"));
  body.appendChild(src);

  li.appendChild(body);
  return li;
}

function section(root, title, rows, opts) {
  const s = el("section", "group");
  const h = el("h2", "");
  h.append(title, el("span", "group-count", String(rows.length)));
  s.appendChild(h);
  const ul = el("ul", "events");
  rows.forEach((r) => ul.appendChild(card(r.it, r.status, opts)));
  s.appendChild(ul);
  root.appendChild(s);
}

function render() {
  const now = today();
  const recent = shiftDays(now, -RECENT_DAYS);
  const type = new FormData($("filters")).get("type");
  const where = $("f-where").value;
  const period = $("f-period").value;

  const rows = state.items
    .map((it) => ({ it, status: screenStatus(it, now) }))
    .filter(({ it, status }) => {
      if (type && it.type !== type) return false;
      if (where && !(it.where || []).some((w) => w.name === where)) return false;
      if (!(it.genres || []).some((g) => state.selected.has(g)) && it.genres?.length) return false;
      if (period === "upcoming") return status === "upcoming";
      if (period === "released") return status !== "upcoming";
      if (period === "active") return status !== "released" || it.release >= recent;
      return true;
    })
    .sort((a, b) => a.it.release.localeCompare(b.it.release) || a.it.title.localeCompare(b.it.title, "fr"));

  $("count").textContent = `${rows.length} titre${rows.length > 1 ? "s" : ""}`;
  const root = $("list");
  root.replaceChildren();
  if (!rows.length) { root.appendChild(el("p", "empty", "Aucun titre ne correspond à ces filtres.")); return; }

  // Séries en cours de diffusion d'abord, puis un intertitre par mois de sortie.
  const airing = rows.filter((r) => r.status === "airing");
  if (airing.length) section(root, "En diffusion", airing, { withYear: true });
  const groups = groupBy(rows.filter((r) => r.status !== "airing"), (r) => r.it.release.slice(0, 7));
  for (const [month, list] of groups) {
    section(root, capitalize(monthTitle.format(new Date(month + "-15T12:00:00"))), list, { withYear: false });
  }
}

function describe(it) {
  return { cls: `t-${it.type}`, kicker: kindLabel(it), text: `${it.title} · ${dateLabel(asEvent(it))}` };
}

function renderPending() {
  renderPendingTab({
    pending: state.pending,
    byId: new Map(state.items.map((it) => [it.id, it])),
    describe,
    extra: { key: "tentative", label: "Dates floues", hint: "Titres annoncés dont la date de sortie en France n'est pas fixée.", rows: state.items.filter((it) => it.tentative) },
    holder: state,
    rerender: renderPending,
  });
}

function syncChips() {
  document.querySelectorAll("#f-genres input").forEach((i) => { i.checked = state.selected.has(i.value); });
  const n = state.selected.size;
  $("genres-summary").textContent = n === state.genres.length ? "tous" : n === 0 ? "aucun" : `${n} sur ${state.genres.length}`;
}

function buildGenreChips() {
  const box = $("f-genres");
  const counts = new Map();
  state.items.forEach((it) => (it.genres || []).forEach((g) => counts.set(g, (counts.get(g) || 0) + 1)));
  state.genres.forEach((g) => {
    const label = el("label", "chip");
    const input = el("input");
    input.type = "checkbox";
    input.value = g;
    label.append(input, el("span", "dot"), el("span", "", g), el("span", "chip-count", String(counts.get(g))));
    box.appendChild(label);
  });
  box.addEventListener("change", (e) => {
    if (e.target.checked) state.selected.add(e.target.value); else state.selected.delete(e.target.value);
    saveSet(STORAGE_KEY, state.selected);
    syncChips();
  });
  $("genres-all").addEventListener("click", () => { state.selected = new Set(state.genres); saveSet(STORAGE_KEY, state.selected); syncChips(); render(); });
  $("genres-none").addEventListener("click", () => { state.selected.clear(); saveSet(STORAGE_KEY, state.selected); syncChips(); render(); });
}

function buildWhereOptions() {
  const counts = new Map();
  state.items.forEach((it) => new Set((it.where || []).map((w) => w.name)).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1)));
  const known = new Set(PLATFORMS.flatMap((g) => g.names));
  const others = [...counts.keys()].filter((n) => !known.has(n)).sort((a, b) => a.localeCompare(b, "fr"));
  const groups = others.length ? [...PLATFORMS, { label: "Autres", names: others }] : PLATFORMS;
  groups.forEach((g) => {
    const og = el("optgroup");
    og.label = g.label;
    g.names.forEach((n) => {
      const o = el("option", "", `${n} (${counts.get(n) || 0})`);
      o.value = n;
      og.appendChild(o);
    });
    $("f-where").appendChild(og);
  });
}

async function init() {
  initShell("screens");
  try {
    const res = await fetch("screens.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.items = data.items;
    state.pending = data.pending || [];
    state.updated = data.updated;
  } catch (e) {
    $("meta").textContent = "Impossible de charger screens.json.";
    return;
  }
  state.genres = [...new Set(state.items.flatMap((it) => it.genres || []))].sort((a, b) => a.localeCompare(b, "fr"));
  state.selected = loadSet(STORAGE_KEY, state.genres);
  buildGenreChips();
  syncChips();
  buildWhereOptions();

  const films = state.items.filter((it) => it.type === "film").length;
  const series = state.items.length - films;
  $("meta").textContent = `${films} film${films > 1 ? "s" : ""} · ${series} série${series > 1 ? "s" : ""}`
    + (state.updated ? ` · mis à jour le ${dayMonth(parts(state.updated), true)}` : "");
  $("filters").addEventListener("change", render);
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  render();
  renderPending();
  initMainTabs();
}

init();
