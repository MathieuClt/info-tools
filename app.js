"use strict";

// Le statut n'est jamais stocké : il est calculé ici à partir de la date du jour.
const STATUS_LABEL = { ongoing: "En cours", upcoming: "À venir", past: "Passé", cancelled: "Annulé" };
const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const $ = (id) => document.getElementById(id);
const state = { events: [] };

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function statusOf(ev, now) {
  if (ev.cancelled) return "cancelled";
  if (ev.start > now) return "upcoming";
  if (!ev.end || ev.end >= now) return "ongoing"; // sans date de fin connue : considéré en cours
  return "past";
}

function dateLabel(ev) {
  const s = fmt.format(new Date(ev.start + "T12:00:00"));
  if (!ev.end) return `Depuis le ${s} (fin non confirmée)`;
  if (ev.end === ev.start) return s;
  return `${s} → ${fmt.format(new Date(ev.end + "T12:00:00"))}`;
}

// Seuls les liens http(s) sont rendus cliquables.
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

// Tout texte issu du JSON passe par textContent : jamais d'insertion HTML.
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function link(href, text, cls) {
  const safe = safeUrl(href);
  if (!safe) return el("span", cls, text);
  const a = el("a", cls, text);
  a.href = safe;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function card(ev, status, showSport) {
  const li = el("li", "event" + (status === "cancelled" ? " is-cancelled" : ""));
  const row = el("div", "row");
  const name = el("span", "name");
  name.appendChild(link(ev.url, ev.name));
  row.append(name, el("span", "badge " + status, STATUS_LABEL[status]));
  li.appendChild(row);
  li.appendChild(el("div", "meta", `${dateLabel(ev)} · ${ev.location}`));
  const foot = el("div", "meta");
  if (showSport) foot.append(el("span", "sportTag", ev.sport + " · "));
  foot.appendChild(link(ev.source, "source"));
  li.appendChild(foot);
  return li;
}

function render() {
  const now = today();
  const sport = $("f-sport").value;
  const wanted = $("f-status").value;
  const view = $("f-view").value;

  const rows = state.events
    .map((ev) => ({ ev, status: statusOf(ev, now) }))
    .filter(({ ev, status }) => {
      if (sport && ev.sport !== sport) return false;
      if (wanted === "active") return status === "ongoing" || status === "upcoming";
      return !wanted || status === wanted;
    })
    .sort((a, b) => a.ev.start.localeCompare(b.ev.start) || a.ev.name.localeCompare(b.ev.name, "fr"));

  const root = $("list");
  root.replaceChildren();
  if (!rows.length) { root.appendChild(el("p", "empty", "Aucun événement ne correspond à ces filtres.")); return; }

  if (view === "sport") {
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.ev.sport)) groups.set(r.ev.sport, []);
      groups.get(r.ev.sport).push(r);
    }
    [...groups.keys()].sort((a, b) => a.localeCompare(b, "fr")).forEach((s) => {
      root.appendChild(el("h2", "", `${s} (${groups.get(s).length})`));
      const ul = el("ul", "events");
      groups.get(s).forEach((r) => ul.appendChild(card(r.ev, r.status, false)));
      root.appendChild(ul);
    });
  } else {
    const ul = el("ul", "events");
    rows.forEach((r) => ul.appendChild(card(r.ev, r.status, true)));
    root.appendChild(ul);
  }
}

async function init() {
  try {
    const res = await fetch("events.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.events = await res.json();
  } catch (e) {
    $("meta").textContent = "Impossible de charger events.json.";
    return;
  }
  const sports = [...new Set(state.events.map((e) => e.sport))].sort((a, b) => a.localeCompare(b, "fr"));
  sports.forEach((s) => { const o = el("option", "", s); o.value = s; $("f-sport").appendChild(o); });
  $("meta").textContent = `${state.events.length} événements · ${sports.length} sports`;
  $("filters").addEventListener("change", render);
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  render();
}

init();
