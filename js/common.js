"use strict";

// Fonctions partagées par toutes les rubriques du site.

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthTitle = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const TIME_ZONE = "Europe/Paris";
const parisParts = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const $ = (id) => document.getElementById(id);

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

function slug(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Dates ISO lues sans fuseau : « 2026-11-01 » → { y, m, d }.
function parts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function day(d) {
  return d === 1 ? "1er" : String(d);
}

function dayMonth(p, withYear) {
  return `${day(p.d)} ${MONTHS[p.m - 1]}` + (withYear ? ` ${p.y}` : "");
}

// Libellé complet, lu par les lecteurs d'écran et utilisé hors des cartes.
function dateLabel(ev) {
  const s = parts(ev.start);
  if (!ev.end) return `depuis le ${dayMonth(s, true)}, fin non confirmée`;
  const e = parts(ev.end);
  if (ev.end === ev.start) return dayMonth(s, true);
  if (s.y !== e.y) return `du ${dayMonth(s, true)} au ${dayMonth(e, true)}`;
  return `du ${dayMonth(s, false)} au ${dayMonth(e, true)}`;
}

// Bloc de date de la carte : jour(s) en gros, mois dessous, année si demandée.
function dateBlock(ev, withYear) {
  const s = parts(ev.start);
  const e = ev.end ? parts(ev.end) : null;
  const box = el("div", "date");
  box.setAttribute("aria-hidden", "true");
  let top, bottom, long = false;
  if (!e) { top = day(s.d); bottom = `${MONTHS[s.m - 1]} →`; }
  else if (ev.end === ev.start) { top = day(s.d); bottom = MONTHS[s.m - 1]; }
  else if (s.m === e.m && s.y === e.y) { top = `${day(s.d)}–${day(e.d)}`; bottom = MONTHS[s.m - 1]; }
  else { top = dayMonth(s, false); bottom = `→ ${dayMonth(e, false)}`; long = true; }
  box.append(el("span", "d1" + (long ? " long" : ""), top), el("span", "d2", bottom));
  if (withYear) box.appendChild(el("span", "d3", e && e.y !== s.y ? `${s.y}–${String(e.y).slice(2)}` : String(s.y)));
  return box;
}

// Heure affichée en heure de Paris : « sam. 22 nov. · 05h00 ».
function timeLabel(iso) {
  const p = Object.fromEntries(parisParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${day(Number(p.day))} ${MONTHS[Number(p.month) - 1]} · ${p.hour}h${p.minute}`;
}

function isPast(iso) {
  return new Date(iso).getTime() < Date.now();
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

function groupBy(rows, key) {
  const groups = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


// Navigation : barre d'application et menu latéral, communs à toutes les rubriques.
const SECTIONS = [
  { key: "sports", href: "./", label: "Sports", desc: "Compétitions, affiches et diffusion TV", icon: "M6 4h12v3a6 6 0 0 1-12 0V4Zm0 1H3v2a3 3 0 0 0 3 3m12-5h3v2a3 3 0 0 1-3 3M12 13v4m-4 3h8l-1-3H9l-1 3Z" },
  { key: "screens", href: "films-series.html", label: "Films & séries", desc: "Sorties cinéma et plateformes", icon: "M4 8h16v11H4V8Zm0 0 2-4h3L7 8m4 0 2-4h3l-2 4m4 0 2-4M4 12h16" },
];
const SVG_NS = "http://www.w3.org/2000/svg";

function icon(d) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return svg;
}

function initShell(current) {
  const section = SECTIONS.find((s) => s.key === current);
  const bar = el("header", "appbar");
  const burger = el("button", "burger");
  burger.type = "button";
  burger.setAttribute("aria-label", "Ouvrir le menu");
  burger.setAttribute("aria-expanded", "false");
  burger.setAttribute("aria-controls", "drawer");
  burger.append(el("span"), el("span"), el("span"));
  const brand = el("a", "brand", "Au programme");
  brand.href = "./";
  const crumb = el("span", "appbar-section", section ? section.label : "");
  const inline = el("nav", "appbar-links");
  inline.setAttribute("aria-label", "Rubriques");

  const drawer = el("nav", "drawer");
  drawer.id = "drawer";
  drawer.setAttribute("aria-label", "Rubriques");
  drawer.inert = true;
  const head = el("div", "drawer-head");
  head.appendChild(el("span", "brand", "Au programme"));
  const close = el("button", "drawer-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fermer le menu");
  head.appendChild(close);
  const list = el("ul", "drawer-list");
  SECTIONS.forEach((s) => {
    const a = el("a", "drawer-item");
    a.href = s.href;
    if (s.key === current) a.setAttribute("aria-current", "page");
    const text = el("span", "drawer-text");
    text.append(el("span", "drawer-label", s.label), el("span", "drawer-desc", s.desc));
    a.append(icon(s.icon), text);
    const li = el("li");
    li.appendChild(a);
    list.appendChild(li);

    const short = el("a", "appbar-link", s.label);
    short.href = s.href;
    if (s.key === current) short.setAttribute("aria-current", "page");
    inline.appendChild(short);
  });
  drawer.append(head, list);
  const backdrop = el("div", "backdrop");

  const setOpen = (open) => {
    document.body.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", String(open));
    drawer.inert = !open;
    if (open) drawer.querySelector("[aria-current]")?.focus(); else burger.focus();
  };
  burger.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) setOpen(false); });

  bar.append(burger, brand, crumb, inline);
  document.body.prepend(bar, backdrop, drawer);
}


// Onglets principaux (contenu / infos non abouties), l'onglet ouvert est reflété dans l'URL.
const PENDING_HASH = "#infos-non-abouties";

function showTab(pending) {
  $("tab-calendar").setAttribute("aria-selected", String(!pending));
  $("tab-pending").setAttribute("aria-selected", String(pending));
  $("panel-calendar").hidden = pending;
  $("panel-pending").hidden = !pending;
}

function initMainTabs() {
  $("tab-calendar").addEventListener("click", () => { history.replaceState(null, "", location.pathname); showTab(false); });
  $("tab-pending").addEventListener("click", () => { history.replaceState(null, "", PENDING_HASH); showTab(true); });
  showTab(location.hash === PENDING_HASH);
}

// Ids des éléments rattachés à un point en suspens (événements ou titres selon la rubrique).
function refsOf(p) {
  return p.events || p.items || [];
}

function pendingCard(p, byId, describe) {
  const li = el("li", "pending-item " + p.kind);
  refsOf(p).map((id) => byId.get(id)).filter(Boolean).forEach((item) => {
    const d = describe(item);
    const k = el("div", `kicker ${d.cls}`);
    k.append(el("span", "sport", d.kicker), el("span", "pending-event", d.text));
    li.appendChild(k);
  });
  li.appendChild(el("h3", "name", p.title));
  li.appendChild(el("p", "detail", p.detail));
  const foot = el("p", "sources");
  foot.append(`Relevé le ${dayMonth(parts(p.since), true)}`);
  (p.sources || []).forEach((u, i) => { foot.append(" · "); foot.appendChild(link(u, `source ${i + 1}`)); });
  li.appendChild(foot);
  return li;
}

// Sous-onglets : incertaines, manquantes, puis un groupe déduit des données propre à la rubrique.
function renderPendingTab({ pending, byId, describe, extra, holder, rerender }) {
  const root = $("pending");
  root.replaceChildren();
  const groups = [];
  for (const [kind, label, hint] of [
    ["uncertain", "Incertaines", "Retenues sur le site, mais avec un doute : source secondaire, sources contradictoires ou information à confirmer."],
    ["missing", "Manquantes", "Écartées ou laissées vides faute de source fiable."],
  ]) {
    const items = pending.filter((p) => p.kind === kind);
    const ul = el("ul", "pending-list");
    items.forEach((p) => ul.appendChild(pendingCard(p, byId, describe)));
    groups.push({ key: kind, label, hint, count: items.length, list: ul });
  }
  const extraList = el("ul", "plain-list");
  extra.rows.forEach((item) => {
    const d = describe(item);
    const li = el("li", d.cls);
    li.append(el("span", "sport", d.kicker), ` ${d.text}`);
    extraList.appendChild(li);
  });
  groups.push({ key: extra.key, label: extra.label, hint: extra.hint, count: extra.rows.length, list: extraList });

  const bar = el("div", "subtabs");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Types d'infos non abouties");
  const panels = el("div");
  if (!groups.some((g) => g.key === holder.pendingGroup && g.count)) holder.pendingGroup = (groups.find((g) => g.count) || groups[0]).key;
  groups.forEach((g) => {
    const btn = el("button");
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.id = `subtab-${g.key}`;
    btn.setAttribute("aria-controls", `subpanel-${g.key}`);
    btn.append(g.label, el("span", "subtab-count", String(g.count)));
    btn.addEventListener("click", () => { holder.pendingGroup = g.key; rerender(); });
    btn.setAttribute("aria-selected", String(g.key === holder.pendingGroup));
    bar.appendChild(btn);

    const panel = el("section", "subpanel");
    panel.id = `subpanel-${g.key}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", btn.id);
    panel.hidden = g.key !== holder.pendingGroup;
    panel.appendChild(el("p", "hint", g.hint));
    panel.appendChild(g.count ? g.list : el("p", "empty", "Rien à signaler."));
    panels.appendChild(panel);
  });
  root.append(bar, panels);
  $("pending-count").textContent = String(pending.length + extra.rows.length);
}

// Pastilles de filtre à cocher, sélection mémorisée dans le navigateur.
function loadSet(key, all) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved)) {
      const known = saved.filter((s) => all.includes(s));
      if (known.length) return new Set(known);
    }
  } catch { /* stockage indisponible ou valeur invalide */ }
  return new Set(all);
}

function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* stockage indisponible */ }
}
