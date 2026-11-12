# Au programme

Site statique (HTML/JS vanilla, sans backend) en deux rubriques, accessibles par le menu latéral : le calendrier des événements sportifs et les sorties de films et de séries en France. Hébergé sur Netlify, source de vérité sur GitHub.

## Fichiers

- `events.json` : les données, un objet `{ "updated": "AAAA-MM-JJ", "events": [...], "pending": [...] }`. `updated` est affiché sous le titre du site et doit être mis à jour à chaque modification des données.
- `events.schema.json` : schéma JSON de `events.json`.
- `screens.json` : les films et séries, même structure (`updated`, `items`, `pending`). Décrit par `screens.schema.json`.
- `index.html` (Sports) et `films-series.html` (Films & séries) : les pages, avec `style.css` commun.
- `js/common.js` : fonctions partagées (dates, liens sûrs, barre d'application et menu, onglet « Infos non abouties »). `js/sports.js` et `js/screens.js` : une rubrique chacun. Les statuts (à venir, en cours, sorti) sont calculés dans le navigateur, jamais stockés.
- `scripts/validate.mjs` : validation des deux fichiers de données (schéma, doublons d'`id`, dates réelles, périodes cohérentes, références des infos non abouties). Lancée par la CI sur chaque PR.
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

## Films et séries (`screens.json`)

| Champ | Obligatoire | Description |
|---|---|---|
| `id` | oui | `type-titre-année`, suivi de `-sN` pour une saison |
| `type` | oui | `film` ou `serie` |
| `title`, `originalTitle` | `title` oui | titre français, titre original s'il diffère |
| `season` | non | numéro de saison (séries) |
| `release` | oui | sortie en salle ou première diffusion en France, `AAAA-MM-JJ` |
| `releaseEnd` | non | séries diffusées chaque semaine : date du dernier épisode |
| `genres` | non | 1 à 4 genres en français |
| `people` | non | `directors`, `creators`, `cast` (6 au plus) |
| `where` | non | où regarder : `name`, `kind` (`cinema`, `streaming`, `tv`), `free`, `source`, `confirmed: false` si non confirmé |
| `url`, `source` | oui | page officielle, source de la date française |
| `tentative` | non | `true` si seule une fenêtre de sortie est annoncée |

Dans `pending`, les titres concernés sont listés dans `items` (et non `events`).

## Infos non abouties

`pending` alimente l'onglet « Infos non abouties » : une entrée par information manquante (`kind: "missing"`, écartée faute de source) ou incertaine (`kind: "uncertain"`, retenue avec un doute). Champs : `id`, `kind`, `title`, `detail`, `since` (date du relevé), `events` (ids des événements concernés, facultatif), `sources` (facultatif). Sur les cartes, seuls les diffuseurs non confirmés (« ? ») et les événements non finalisés (badge) sont signalés. L'onglet ajoute de lui-même les événements à venir sans diffuseur confirmé. Une entrée est retirée dès que le point est résolu.

## Règles de qualité

- Pas d'événement sans `source`, pas de diffuseur sans `source` confirmant ses droits pour l'édition concernée.
- Ne jamais inventer une date ou un lieu : si ce n'est pas vérifiable, ne pas l'ajouter.
- Conserver les `id` existants pour mettre à jour au lieu de dupliquer.
- Les mises à jour passent par pull request, jamais par push direct sur `main`.

## Mise à jour quotidienne

Un job tourne une fois par jour. Il relit `events.json` et `screens.json`, cherche sur le web les changements (dates, lieux, annulations, diffuseurs, dates de sortie, plateformes, casting), applique les corrections sourcées, complète les participants dès qu'ils sont connus, met à jour `pending` et `updated`, lance `npm run validate` puis ouvre une pull request listant chaque changement avec sa source. Il ne pousse jamais sur `main`.

## Développement local

```sh
npm install
npm run validate
python3 -m http.server 8000   # puis http://localhost:8000
```
