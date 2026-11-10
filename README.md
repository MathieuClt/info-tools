# Calendrier des événements sportifs

Site statique (HTML/JS vanilla, sans backend) listant les tournois et événements sportifs. Hébergé sur Netlify, source de vérité sur GitHub.

## Fichiers

- `events.json` : les données (un tableau d'objets).
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

## Règles de qualité

- Pas d'événement sans `source`.
- Ne jamais inventer une date ou un lieu : si ce n'est pas vérifiable, ne pas l'ajouter.
- Conserver les `id` existants pour mettre à jour au lieu de dupliquer.
- Les mises à jour passent par pull request, jamais par push direct sur `main`.

## Développement local

```sh
npm install
npm run validate
python3 -m http.server 8000   # puis http://localhost:8000
```
