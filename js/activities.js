"use strict";

// Rubrique Activités : événements et lieux à Montpellier et alentour (activities.json).
const TYPES = {
  concert: "Concert", spectacle: "Spectacle", soiree: "Soirée & bar", exposition: "Exposition", festival: "Festival",
  marche: "Marché & salon", atelier: "Atelier & conférence", sport: "Sport", nature: "Nature", patrimoine: "Patrimoine", famille: "Famille",
};
// Point de référence des distances : place de la Comédie.
const ORIGIN = { lat: 43.6086, lon: 3.8797 };
const MAX_KM = 50;
const STORAGE_KEY = "activity-types";
const RADIUS_KEY = "activity-radius";
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const state = { items: [], pending: [], updated: null, types: [], selected: new Set(), pendingGroup: null, cal: { month: null, from: null, to: null }, map: null, circle: null, markers: null };

function distanceKm(lat, lon) {
  const rad = (x) => x * Math.PI / 180;
  const dLat = rad(lat - ORIGIN.lat);
  const dLon = rad(lon - ORIGIN.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(ORIGIN.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function kmLabel(km) {
  return km < 1 ? "moins de 1 km" : `${Math.round(km)} km`;
}

function isPlace(it) {
  return !it.start;
}

function activityStatus(it, now) {
  if (isPlace(it)) return "place";
  return statusOf(it, now);
}

// Prochain week-end (celui en cours le samedi et le dimanche), au format ISO.
function weekend(now) {
  const d = new Date(now + "T12:00:00");
  const dow = d.getDay();
  const toSat = dow === 0 ? -1 : 6 - dow;
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  d.setDate(d.getDate() + toSat);
  const sat = iso(d);
  d.setDate(d.getDate() + 1);
  return { from: sat, to: iso(d) };
}

function shiftDays(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Recherche insensible à la casse et aux accents sur le titre, le lieu, la commune et la note.
function matches(it, words) {
  if (!words.length) return true;
  const hay = slug([it.title, it.venue, it.town, it.note].filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

function placeLine(it) {
  const where = it.venue && it.venue !== it.town ? `${it.venue} · ${it.town}` : it.town;
  return `${where} · ${kmLabel(it.km)}`;
}

function distanceBlock(it) {
  const box = el("div", "date");
  box.setAttribute("aria-hidden", "true");
  box.append(el("span", "d1", String(Math.max(1, Math.round(it.km)))), el("span", "d2", "km"));
  return box;
}

function card(it, status, opts) {
  const li = el("li", `event a-${it.type} is-${status === "place" ? "upcoming" : status}`);
  li.id = `act-${it.id}`;
  li.appendChild(isPlace(it) ? distanceBlock(it) : dateBlock(it, opts.withYear));

  const body = el("div", "body");
  if (!isPlace(it)) body.appendChild(el("span", "sr-only", dateLabel(it)));
  const kicker = el("div", "kicker");
  kicker.appendChild(el("span", "sport", TYPES[it.type]));
  if (status === "ongoing") kicker.appendChild(el("span", "badge ongoing", "En cours"));
  if (status === "cancelled") kicker.appendChild(el("span", "badge cancelled", "Annulé"));
  if (it.tentative) kicker.appendChild(el("span", "badge tentative", "Non finalisé"));
  if (it.free) kicker.appendChild(el("span", "badge free", "Gratuit"));
  body.appendChild(kicker);

  const title = el("h3", "name");
  title.appendChild(link(it.url, it.title));
  body.appendChild(title);
  body.appendChild(el("p", "place", placeLine(it)));
  if (it.result) body.appendChild(resultLine(it.result));
  if (it.at && !isPast(it.at)) body.appendChild(el("p", "when", timeLabel(it.at)));
  if (it.note) body.appendChild(el("p", "note", it.note));

  const foot = el("div", "card-foot");
  const show = el("button", "show-on-map", "Voir sur la carte");
  show.type = "button";
  show.addEventListener("click", () => focusMarker(it));
  const src = el("p", "sources");
  src.append("Source : ");
  src.appendChild(link(it.source, isPlace(it) ? "infos pratiques" : "date et lieu"));
  foot.append(show, src);
  body.appendChild(foot);

  li.appendChild(body);
  return li;
}

// Résultat d'un match passé : score mis en avant, résumé et source.
function resultLine(r) {
  const box = el("div", "result");
  if (r.score) box.appendChild(el("span", "result-score", r.score.replace("-", " – ")));
  const text = el("span", "result-text");
  if (r.summary) text.append(r.summary, " · ");
  text.appendChild(link(r.source, "résultat"));
  box.appendChild(text);
  return box;
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

function radius() {
  return Number($("f-radius").value);
}

// Filtres hors période : type, rayon, prix et recherche. Le calendrier s'en sert aussi pour compter les événements du jour.
function baseFilter() {
  const km = radius();
  const free = $("f-price").value === "free";
  const words = slug($("f-search").value).split("-").filter(Boolean);
  return (it) => it.km <= km && state.selected.has(it.type) && (!free || it.free) && matches(it, words);
}

function overlaps(it, from, to) {
  return !isPlace(it) && !it.cancelled && it.start <= to && it.end >= from;
}

function filteredRows() {
  const now = today();
  const period = $("f-period").value;
  const keep = baseFilter();
  const ranges = { weekend: weekend(now), today: { from: now, to: now }, week: { from: now, to: shiftDays(now, 6) } };
  const range = state.cal.from ? state.cal : ranges[period];
  return state.items
    .filter(keep)
    .map((it) => ({ it, status: activityStatus(it, now) }))
    .filter(({ it, status }) => {
      if (range) return overlaps(it, range.from, range.to);
      if (period === "places") return status === "place";
      if (period === "events") return status === "upcoming" || status === "ongoing";
      if (period === "active") return status !== "past";
      if (period === "results") return status === "past" && Boolean(it.result);
      return true;
    });
}

function render() {
  const km = radius();
  $("radius-value").textContent = `${km} km`;
  renderCalendar();
  const rows = filteredRows();
  updateMap(rows, km);

  const places = rows.filter((r) => r.status === "place").sort((a, b) => a.it.km - b.it.km);
  // Les résultats se lisent du plus récent au plus ancien.
  const desc = $("f-period").value === "results" && !state.cal.from;
  const events = rows.filter((r) => r.status !== "place")
    .sort((a, b) => (desc ? b.it.start.localeCompare(a.it.start) : a.it.start.localeCompare(b.it.start)) || a.it.km - b.it.km);
  $("count").textContent = `${events.length} événement${events.length > 1 ? "s" : ""} · ${places.length} lieu${places.length > 1 ? "x" : ""} dans un rayon de ${km} km`;

  const root = $("list");
  root.replaceChildren();
  if (!rows.length) { root.appendChild(el("p", "empty", "Aucune activité ne correspond à ces filtres.")); return; }

  // Événements en cours d'abord, puis un intertitre par mois de début, puis les lieux du plus proche au plus loin.
  const ongoing = events.filter((r) => r.status === "ongoing");
  if (ongoing.length) section(root, "En cours", ongoing, { withYear: true });
  const groups = groupBy(events.filter((r) => r.status !== "ongoing"), (r) => r.it.start.slice(0, 7));
  for (const [month, list] of groups) {
    section(root, capitalize(monthTitle.format(new Date(month + "-15T12:00:00"))), list, { withYear: false });
  }
  if (places.length) section(root, "Toute l'année", places, {});
}

// Calendrier : un clic choisit un jour, un second clic sur un autre jour étend la sélection en période.
const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangeLabel(from, to) {
  if (from === to) return dayMonth(parts(from), false);
  const a = parts(from), b = parts(to);
  return a.m === b.m ? `du ${day(a.d)} au ${dayMonth(b, false)}` : `du ${dayMonth(a, false)} au ${dayMonth(b, false)}`;
}

function pickDay(iso) {
  const c = state.cal;
  if (c.from && c.from === c.to && iso === c.from) { c.from = c.to = null; }
  else if (c.from && c.from === c.to) { [c.from, c.to] = iso < c.from ? [iso, c.from] : [c.from, iso]; }
  else { c.from = c.to = iso; }
  render();
}

function renderCalendar() {
  const c = state.cal;
  const now = today();
  if (!c.month) c.month = now.slice(0, 7);
  $("date-summary").textContent = c.from ? rangeLabel(c.from, c.to) : "toutes";
  $("f-period").disabled = Boolean(c.from);
  $("date-clear").hidden = !c.from;

  const first = new Date(c.month + "-01T12:00:00");
  $("cal-title").textContent = capitalize(monthTitle.format(first));
  $("cal-prev").disabled = c.month <= (state.firstMonth || now.slice(0, 7));
  const grid = $("cal-grid");
  grid.replaceChildren();
  WEEKDAYS.forEach((w) => grid.appendChild(el("span", "cal-wd", w.charAt(0).toUpperCase())));
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const keep = baseFilter();
  const events = state.items.filter((it) => !isPlace(it) && !it.cancelled && keep(it));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoOf(d);
    if (i >= 35 && iso.slice(0, 7) !== c.month) break;
    const n = events.filter((it) => it.start <= iso && it.end >= iso).length;
    const btn = el("button", "cal-day");
    btn.type = "button";
    btn.disabled = iso < now && !n;
    if (iso.slice(0, 7) !== c.month) btn.classList.add("is-out");
    if (iso === now) btn.classList.add("is-today");
    if (c.from && iso >= c.from && iso <= c.to) btn.classList.add(iso === c.from || iso === c.to ? "is-edge" : "is-in");
    btn.setAttribute("aria-pressed", String(Boolean(c.from && iso >= c.from && iso <= c.to)));
    btn.setAttribute("aria-label", `${WEEKDAYS[(d.getDay() + 6) % 7]} ${dayMonth(parts(iso), true)}, ${n} événement${n > 1 ? "s" : ""}`);
    btn.append(el("span", "cal-num", String(d.getDate())), el("span", "cal-count", n ? String(n) : ""));
    btn.addEventListener("click", () => pickDay(iso));
    grid.appendChild(btn);
  }
}

function initCalendar() {
  const move = (delta) => {
    const d = new Date(state.cal.month + "-15T12:00:00");
    d.setMonth(d.getMonth() + delta);
    state.cal.month = isoOf(d).slice(0, 7);
    renderCalendar();
  };
  $("cal-prev").addEventListener("click", () => move(-1));
  $("cal-next").addEventListener("click", () => move(1));
  $("date-clear").addEventListener("click", () => { state.cal.from = state.cal.to = null; render(); });
}

// Carte : cercle du rayon choisi autour de Montpellier, une pastille par activité affichée.
function initMap() {
  if (typeof L === "undefined") { $("map").hidden = true; return; }
  const map = L.map("map", { scrollWheelZoom: false, zoomSnap: 0.25 }).setView([ORIGIN.lat, ORIGIN.lon], 9);
  L.tileLayer(TILES, { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  L.circleMarker([ORIGIN.lat, ORIGIN.lon], { radius: 5, className: "mk-origin" }).addTo(map).bindTooltip("Montpellier, place de la Comédie");
  state.circle = L.circle([ORIGIN.lat, ORIGIN.lon], { radius: MAX_KM * 1000, className: "mk-radius", interactive: false }).addTo(map);
  state.markers = L.layerGroup().addTo(map);
  state.map = map;
  map.fitBounds(state.circle.getBounds());
}

function popup(it) {
  const box = el("div", "popup");
  box.appendChild(el("span", `sport a-${it.type}`, TYPES[it.type]));
  const title = el("strong", "popup-title");
  title.appendChild(link(it.url, it.title));
  box.appendChild(title);
  box.appendChild(el("span", "popup-meta", isPlace(it) ? placeLine(it) : `${capitalize(dateLabel(it))} · ${placeLine(it)}`));
  const go = el("button", "popup-go", "Voir la fiche");
  go.type = "button";
  go.addEventListener("click", () => {
    const target = $(`act-${it.id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-focused");
    setTimeout(() => target.classList.remove("is-focused"), 1600);
  });
  box.appendChild(go);
  return box;
}

function updateMap(rows, km) {
  if (!state.map) return;
  const previous = state.circle.getRadius();
  state.circle.setRadius(km * 1000);
  state.markers.clearLayers();
  state.byMarker = new Map();
  // Plusieurs activités au même endroit partagent une seule pastille.
  const spots = groupBy(rows, (r) => `${r.it.lat.toFixed(4)},${r.it.lon.toFixed(4)}`);
  for (const list of spots.values()) {
    const first = list[0].it;
    const marker = L.circleMarker([first.lat, first.lon], { radius: list.length > 1 ? 8 : 6, className: `mk a-${first.type}` + (list.length > 1 ? " mk-multi" : "") });
    if (list.length > 1) {
      const box = el("div", "popup-list");
      list.forEach((r) => box.appendChild(popup(r.it)));
      marker.bindPopup(box, { maxHeight: 260 });
    } else {
      marker.bindPopup(popup(first));
    }
    list.forEach((r) => state.byMarker.set(r.it.id, marker));
    state.markers.addLayer(marker);
  }
  if (previous !== km * 1000) state.map.flyToBounds(state.circle.getBounds(), { duration: 0.4 });
}

function focusMarker(it) {
  const marker = state.byMarker?.get(it.id);
  if (!marker) return;
  $("map").scrollIntoView({ behavior: "smooth", block: "center" });
  state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 12));
  marker.openPopup();
}

function describe(it) {
  return { cls: `a-${it.type}`, kicker: TYPES[it.type], text: `${it.title} · ${isPlace(it) ? it.town : dateLabel(it)}` };
}

function renderPending() {
  renderPendingTab({
    pending: state.pending,
    byId: new Map(state.items.map((it) => [it.id, it])),
    describe,
    extra: { key: "tentative", label: "Non finalisés", hint: "Événements annoncés dont la date ou le programme n'est pas encore définitif.", rows: state.items.filter((it) => it.tentative) },
    holder: state,
    rerender: renderPending,
  });
}

function syncChips() {
  document.querySelectorAll("#f-types input").forEach((i) => { i.checked = state.selected.has(i.value); });
  const n = state.selected.size;
  $("types-summary").textContent = n === state.types.length ? "tous" : n === 0 ? "aucun" : `${n} sur ${state.types.length}`;
}

function buildTypeChips() {
  const box = $("f-types");
  const counts = new Map();
  state.items.forEach((it) => counts.set(it.type, (counts.get(it.type) || 0) + 1));
  state.types.forEach((t) => {
    const label = el("label", `chip a-${t}`);
    const input = el("input");
    input.type = "checkbox";
    input.value = t;
    label.append(input, el("span", "dot"), el("span", "", TYPES[t]), el("span", "chip-count", String(counts.get(t))));
    box.appendChild(label);
  });
  box.addEventListener("change", (e) => {
    if (e.target.checked) state.selected.add(e.target.value); else state.selected.delete(e.target.value);
    saveSet(STORAGE_KEY, state.selected);
    syncChips();
  });
  $("types-all").addEventListener("click", () => { state.selected = new Set(state.types); saveSet(STORAGE_KEY, state.selected); syncChips(); render(); });
  $("types-none").addEventListener("click", () => { state.selected.clear(); saveSet(STORAGE_KEY, state.selected); syncChips(); render(); });
}

function initRadius() {
  const input = $("f-radius");
  try {
    const saved = Number(localStorage.getItem(RADIUS_KEY));
    if (saved >= Number(input.min) && saved <= MAX_KM) input.value = String(saved);
  } catch { /* stockage indisponible */ }
  input.addEventListener("input", () => {
    try { localStorage.setItem(RADIUS_KEY, input.value); } catch { /* stockage indisponible */ }
    render();
  });
  $("f-search").addEventListener("input", render);
}

async function init() {
  initShell("activities");
  try {
    const res = await fetch("activities.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    // Un événement d'un seul jour n'a pas de date de fin : elle vaut sa date de début.
    state.items = data.items
      .map((it) => ({ ...it, end: it.start && !it.end ? it.start : it.end, km: distanceKm(it.lat, it.lon) }))
      .filter((it) => it.km <= MAX_KM);
    state.pending = data.pending || [];
    state.updated = data.updated;
  } catch (e) {
    $("meta").textContent = "Impossible de charger activities.json.";
    return;
  }
  state.firstMonth = state.items.filter((it) => it.start).reduce((m, it) => (it.start < m ? it.start : m), today()).slice(0, 7);
  state.types = Object.keys(TYPES).filter((t) => state.items.some((it) => it.type === t));
  state.selected = loadSet(STORAGE_KEY, state.types);
  buildTypeChips();
  syncChips();
  initRadius();
  initCalendar();
  initMap();

  const places = state.items.filter(isPlace).length;
  const events = state.items.length - places;
  $("meta").textContent = `${events} événement${events > 1 ? "s" : ""} · ${places} lieu${places > 1 ? "x" : ""}`
    + (state.updated ? ` · mis à jour le ${dayMonth(parts(state.updated), true)}` : "");
  $("filters").addEventListener("change", render);
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  render();
  renderPending();
  initMainTabs();
  // La carte est créée dans un onglet parfois masqué : elle doit recalculer sa taille quand il réapparaît.
  $("tab-calendar").addEventListener("click", () => {
    if (!state.map) return;
    state.map.invalidateSize();
    state.map.fitBounds(state.circle.getBounds());
  });
}

init();
