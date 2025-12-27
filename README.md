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

Le `docker-compose.yml` démarre un container nommé **`ganti-server`** pour coller aux commandes de dev.

```bash
docker compose up --build
```

Puis, pour lancer Biome (dans le container):

```bash
docker exec -it ganti-server npx biome check --changed
```


