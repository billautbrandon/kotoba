# Kotoba

Mini app de vocabulaire japonais basée sur une mécanique simple:

- **Entraînement**: on révèle la réponse puis on choisit un feedback (**✅ Réussi**, **⚠️ Partiellement**, **❌ Raté**)
- **Stats par mot**: compteurs + score cumulatif (utilisé en interne)
- **Mots difficiles**: vue filtrée (ex: `score <= -5` ou `failRate > 40%`)

## Démarrage (local)

Pré-requis: Node.js 20+

```bash
npm install
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001` (health: `GET /api/health`)

## Démarrage (Docker)

Le `docker-compose.yml` démarre un container nommé **`kotoba`**.

```bash
docker compose up --build
```

Puis, pour lancer Biome (dans le container):

```bash
docker exec -it kotoba npx biome check --changed
```

## Téléchargement automatique des SVG de kanji

L'application supporte l'affichage de l'ordre de tracé des kanji avec animations. Pour télécharger automatiquement les fichiers SVG pour tous les kanji utilisés dans votre vocabulaire :

```bash
make download-kanji
```

Ou directement :
```bash
cd apps/api && npm run download-kanji-svg
```

Ce script :
- Extrait automatiquement tous les kanji uniques de votre base de données
- Télécharge les fichiers SVG correspondants depuis KanjiVG
- Les sauvegarde dans `apps/web/public/kanji/` avec le bon format de nommage

Le script est idempotent : l'exécuter plusieurs fois ne téléchargera que les fichiers manquants.


