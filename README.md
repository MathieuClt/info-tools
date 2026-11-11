# Calendrier des événements sportifs

Site statique (HTML/JS vanilla, sans backend) listant les tournois et événements sportifs. Hébergé sur Netlify, source de vérité sur GitHub.

## Fichiers

- `events.json` : les données, un objet `{ "updated": "AAAA-MM-JJ", "events": [...], "pending": [...] }`. `updated` est affiché sous le titre du site et doit être mis à jour à chaque modification des données.
- `events.schema.json` : schéma JSON de `events.json`.
- `index.html`, `app.js`, `style.css` : le site. Le statut (passé / en cours / à venir) est calculé dans le navigateur, jamais stocké.
- `scripts/validate.mjs` : validation (schéma, doublons d'`id`, dates réelles, `start` ≤ `end`). Lancée par la CI sur chaque PR.
- `netlify.toml` : publication de la racine, en-têtes de sécurité.

## Modèle de données

| Champ | Obligatoire | Description |
|---|---|---|
| `id` | oui | `sport-nom-année` en minuscules sans accents ; sert au dédoublonnage |
| `sport`, `name` | oui | |
| `start` | oui | `AAAA-MM-JJ` |
| `end` | non | `AAAA-MM-JJ`. Absent si la fin n'est pas confirmée (l'événement reste « en cours ») |
| `location` | oui | |
| `url` | oui | site officiel |
| `source` | oui | URL ayant servi à vérifier l'information |
| `cancelled` | non | `true` si annulé |
| `tentative` | non | `true` si l'événement est annoncé mais non finalisé (badge « Non finalisé ») |
| `broadcasts` | non | diffuseurs en France : `name`, `free` (gratuit ou non), `source` (URL qui confirme les droits), `confirmed: false` pour un diffuseur affiché comme non confirmé, `note` facultative. Absent ou vide si rien n'est vérifié (le site affiche « non confirmée ») |
| `schedule` | non | horaires clés (`label`, `at`, `source`), `at` au format ISO 8601 avec décalage UTC explicite (`2026-11-21T20:00:00-08:00`). Affichés en heure de Paris, masqués une fois passés |
| `participants` | non | `type` (`teams` ou `athletes`), `matches` (affiches fixées : `a`, `b`, et en option `date`, `at` pour l'heure au même format que `schedule`, `label`, `source` de l'horaire) et/ou `entries` (liste fermée des engagés, 48 au plus), `source`. Uniquement ce qui est officiellement confirmé |

## Infos non abouties

`pending` alimente l'onglet « Infos non abouties » : une entrée par information manquante (`kind: "missing"`, écartée faute de source) ou incertaine (`kind: "uncertain"`, retenue avec un doute). Champs : `id`, `kind`, `title`, `detail`, `since` (date du relevé), `events` (ids des événements concernés, facultatif), `sources` (facultatif). Sur les cartes, seuls les diffuseurs non confirmés (« ? ») et les événements non finalisés (badge) sont signalés. L'onglet ajoute de lui-même les événements à venir sans diffuseur confirmé. Une entrée est retirée dès que le point est résolu.

## Règles de qualité

- Pas d'événement sans `source`, pas de diffuseur sans `source` confirmant ses droits pour l'édition concernée.
- Ne jamais inventer une date ou un lieu : si ce n'est pas vérifiable, ne pas l'ajouter.
- Conserver les `id` existants pour mettre à jour au lieu de dupliquer.
- Les mises à jour passent par pull request, jamais par push direct sur `main`.

## Mise à jour quotidienne

Un job tourne une fois par jour. Il relit `events.json`, cherche sur le web les changements (dates, lieux, annulations, diffuseurs), applique les corrections sourcées, complète les participants dès qu'ils sont connus, met à jour `pending` et `updated`, lance `npm run validate` puis ouvre une pull request listant chaque changement avec sa source. Il ne pousse jamais sur `main`.

## Développement local

```sh
npm install
npm run validate
python3 -m http.server 8000   # puis http://localhost:8000
```
