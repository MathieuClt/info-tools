"use strict";

// Rubrique Sports : calendrier des événements sportifs (events.json).
// Le statut n'est jamais stocké : il est calculé ici à partir de la date du jour.
const STATUS_LABEL = { ongoing: "En cours", upcoming: "À venir", past: "Terminé", cancelled: "Annulé" };
const STORAGE_KEY = "sports-selection";

const state = { events: [], pending: [], updated: null, sports: [], selected: new Set(), pendingGroup: null };

const MATCHES_SHOWN = 3;

function matchItem(m) {
  const li = el("li");
  const when = m.at ? timeLabel(m.at) : m.date ? dayMonth(parts(m.date), false) : null;
  const info = [when, m.label].filter(Boolean).join(" · ");
  if (info) {
    const span = el("span", "match-info", info);
    if (m.at) span.title = "Heure de Paris";
    li.appendChild(span);
  }
  const line = el("span", "match");
  line.append(el("strong", "", m.a), el("span", "vs", "vs"), el("strong", "", m.b));
  li.appendChild(line);
  return li;
}

function participants(ev) {
  const p = ev.participants;
  if (!p) return null;
  const box = el("div", "participants");
  // Les affiches déjà jouées sont masquées ; au-delà de trois, le reste est replié.
  const now = today();
  const matches = (p.matches || []).filter((m) => (m.at ? !isPast(m.at) : !m.date || m.date >= now));
  if (matches.length) {
    const ul = el("ul", "matches");
    matches.slice(0, MATCHES_SHOWN).forEach((m) => ul.appendChild(matchItem(m)));
    box.appendChild(ul);
    if (matches.length > MATCHES_SHOWN) {
      const d = el("details", "more");
      const rest = el("ul", "matches");
      matches.slice(MATCHES_SHOWN).forEach((m) => rest.appendChild(matchItem(m)));
      d.append(el("summary", "", `${matches.length - MATCHES_SHOWN} autres affiches`), rest);
      box.appendChild(d);
    }
  }
  if (p.entries?.length) {
    const what = p.type === "teams" ? "équipes engagées" : "athlètes engagés";
    const list = el("p", "entries-list", p.entries.join(", "));
    if (p.entries.length <= 8 && !matches.length) {
      box.append(el("span", "entries-label", `${p.entries.length} ${what} : `), list);
      box.classList.add("inline");
    } else {
      const d = el("details", "more");
      d.append(el("summary", "", `${p.entries.length} ${what}`), list);
      box.appendChild(d);
    }
  }
  return box.childNodes.length ? box : null;
}

// Horaires clés de l'événement (course, finale, carte principale), passés masqués.
function schedule(ev) {
  const items = (ev.schedule || []).filter((x) => !isPast(x.at));
  if (!items.length) return null;
  const ul = el("ul", "schedule");
  items.forEach((x) => {
    const li = el("li");
    li.title = "Heure de Paris";
    li.append(el("span", "schedule-label", x.label), el("span", "schedule-time", timeLabel(x.at)));
    ul.appendChild(li);
  });
  return ul;
}

function broadcasts(ev) {
  const line = el("div", "tv");
  line.appendChild(el("span", "tv-label", "TV"));
  const list = ev.broadcasts || [];
  if (!list.length) {
    line.appendChild(el("span", "tv-none", "diffusion en France non confirmée"));
    return line;
  }
  list.forEach((b) => {
    const unsure = b.confirmed === false;
    const a = link(b.source, b.name + (unsure ? " ?" : ""), "tv-name" + (b.free ? " is-free" : "") + (unsure ? " is-unconfirmed" : ""));
    a.title = (unsure ? "Non confirmé · " : "") + (b.free ? "En clair" : "Payant") + (b.note ? ` · ${b.note}` : "");
    line.appendChild(a);
  });
  if (list.some((b) => b.free)) line.appendChild(el("span", "free-hint", "en clair"));
  if (list.some((b) => b.confirmed === false)) line.appendChild(el("span", "unsure-hint", "? non confirmé"));
  return line;
}

function card(ev, status, opts) {
  const li = el("li", `event s-${slug(ev.sport)} is-${status}`);
  li.appendChild(dateBlock(ev, opts.withYear));

  const body = el("div", "body");
  body.appendChild(el("span", "sr-only", dateLabel(ev)));
  const kicker = el("div", "kicker");
  kicker.appendChild(el("span", "sport", ev.sport));
  if (status !== "upcoming") kicker.appendChild(el("span", "badge " + status, STATUS_LABEL[status]));
  if (ev.tentative) kicker.appendChild(el("span", "badge tentative", "Non finalisé"));
  body.appendChild(kicker);

  const title = el("h3", "name");
  title.appendChild(link(ev.url, ev.name));
  body.appendChild(title);
  body.appendChild(el("p", "place", ev.location));
  const times = schedule(ev);
  if (times) body.appendChild(times);

  const who = participants(ev);
  if (who) body.appendChild(who);
  body.appendChild(broadcasts(ev));

  const src = el("p", "sources");
  src.append("Sources : ");
  src.appendChild(link(ev.source, "dates"));
  if (ev.participants?.source) { src.append(" · "); src.appendChild(link(ev.participants.source, "participants")); }
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
  rows.forEach((r) => ul.appendChild(card(r.ev, r.status, opts)));
  s.appendChild(ul);
  root.appendChild(s);
}

function render() {
  const now = today();
  const wanted = $("f-status").value;
  const view = $("f-view").value;

  const rows = state.events
    .map((ev) => ({ ev, status: statusOf(ev, now) }))
    .filter(({ ev, status }) => {
      if (!state.selected.has(ev.sport)) return false;
      if (wanted === "active") return status === "ongoing" || status === "upcoming";
      return !wanted || status === wanted;
    })
    .sort((a, b) => a.ev.start.localeCompare(b.ev.start) || a.ev.name.localeCompare(b.ev.name, "fr"));

  $("count").textContent = `${rows.length} événement${rows.length > 1 ? "s" : ""}`;
  const root = $("list");
  root.replaceChildren();
  if (!rows.length) { root.appendChild(el("p", "empty", "Aucun événement ne correspond à ces filtres.")); return; }

  if (view === "sport") {
    const groups = groupBy(rows, (r) => r.ev.sport);
    [...groups.keys()].sort((a, b) => a.localeCompare(b, "fr"))
      .forEach((s) => section(root, s, groups.get(s), { withYear: true }));
    return;
  }

  // Vue par date : les événements en cours d'abord, puis un intertitre par mois de début.
  const ongoing = rows.filter((r) => r.status === "ongoing");
  if (ongoing.length) section(root, "En cours", ongoing, { withYear: true });
  const groups = groupBy(rows.filter((r) => r.status !== "ongoing"), (r) => r.ev.start.slice(0, 7));
  for (const [month, list] of groups) {
    section(root, capitalize(monthTitle.format(new Date(month + "-15T12:00:00"))), list, { withYear: false });
  }
}

// Onglet « Infos non abouties » : points consignés, plus les événements à venir sans diffuseur confirmé.
function describe(ev) {
  return { cls: `s-${slug(ev.sport)}`, kicker: ev.sport, text: `${ev.name} · ${dateLabel(ev)}` };
}

function renderPending() {
  const now = today();
  const noTv = state.events.filter((e) => {
    const st = statusOf(e, now);
    return st !== "past" && st !== "cancelled" && !(e.broadcasts || []).some((b) => b.confirmed !== false);
  });
  renderPendingTab({
    pending: state.pending,
    byId: new Map(state.events.map((e) => [e.id, e])),
    describe,
    extra: { key: "no-tv", label: "Sans TV", hint: "Événements en cours ou à venir sans diffuseur confirmé en France.", rows: noTv },
    holder: state,
    rerender: renderPending,
  });
}

function saveSelection() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected])); } catch { /* stockage indisponible */ }
}

function loadSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      const known = saved.filter((s) => state.sports.includes(s));
      if (known.length) return new Set(known);
    }
  } catch { /* stockage indisponible ou valeur invalide */ }
  return new Set(state.sports);
}

function syncChips() {
  document.querySelectorAll("#f-sports input").forEach((i) => { i.checked = state.selected.has(i.value); });
  const n = state.selected.size;
  $("sports-summary").textContent = n === state.sports.length ? "tous" : n === 0 ? "aucun" : `${n} sur ${state.sports.length}`;
}

function buildSportChips() {
  const box = $("f-sports");
  const counts = groupBy(state.events, (e) => e.sport);
  state.sports.forEach((s) => {
    const label = el("label", `chip s-${slug(s)}`);
    const input = el("input");
    input.type = "checkbox";
    input.value = s;
    label.append(input, el("span", "dot"), el("span", "", s), el("span", "chip-count", String(counts.get(s).length)));
    box.appendChild(label);
  });
  box.addEventListener("change", (e) => {
    if (e.target.checked) state.selected.add(e.target.value); else state.selected.delete(e.target.value);
    saveSelection();
    syncChips();
  });
  $("sports-all").addEventListener("click", () => { state.selected = new Set(state.sports); saveSelection(); syncChips(); render(); });
  $("sports-none").addEventListener("click", () => { state.selected.clear(); saveSelection(); syncChips(); render(); });
}

async function init() {
  initShell("sports");
  try {
    const res = await fetch("events.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.events = data.events;
    state.pending = data.pending || [];
    state.updated = data.updated;
  } catch (e) {
    $("meta").textContent = "Impossible de charger events.json.";
    return;
  }
  state.sports = [...new Set(state.events.map((e) => e.sport))].sort((a, b) => a.localeCompare(b, "fr"));
  state.selected = loadSelection();
  buildSportChips();
  syncChips();
  $("meta").textContent = `${state.events.length} événements · ${state.sports.length} sports`
    + (state.updated ? ` · mis à jour le ${dayMonth(parts(state.updated), true)}` : "");
  $("filters").addEventListener("change", render);
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  render();
  renderPending();
  initMainTabs();
}

init();
