# Configuration de production pour kotoba.ovh

## Prérequis

1. Docker et Docker Compose installés sur le VPS
2. Domaine `kotoba.ovh` pointant vers l'IP du VPS
3. Certificats SSL (Let's Encrypt recommandé)

## Installation

### 1. Cloner le projet sur le VPS

```bash
git clone <repository-url> /path/to/kotoba
cd /path/to/kotoba
```

### 2. Configurer les variables d'environnement

```bash
cp .env.prod.example .env.prod
# Éditer .env.prod et définir SESSION_SECRET avec une valeur sécurisée
# Générer une clé: openssl rand -base64 32
```

### 3. Obtenir les certificats SSL

#### Option A: Let's Encrypt avec Certbot (recommandé)

```bash
# Installer certbot
sudo apt-get update
sudo apt-get install certbot

# Obtenir les certificats
sudo certbot certonly --standalone -d kotoba.ovh -d www.kotoba.ovh

# Les certificats seront dans /etc/letsencrypt/live/kotoba.ovh/
# Créer un lien symbolique ou copier vers nginx/ssl/
sudo mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/kotoba.ovh/fullchain.pem nginx/ssl/kotoba.ovh.crt
sudo cp /etc/letsencrypt/live/kotoba.ovh/privkey.pem nginx/ssl/kotoba.ovh.key
sudo chmod 644 nginx/ssl/kotoba.ovh.crt
sudo chmod 600 nginx/ssl/kotoba.ovh.key
```

#### Option B: Certificats auto-signés (pour test uniquement)

```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/kotoba.ovh.key \
  -out nginx/ssl/kotoba.ovh.crt \
  -subj "/CN=kotoba.ovh"
```

### 4. Construire et démarrer les services

```bash
# Construire les images Docker
make prod-build

# Démarrer les services
make prod-up

# Vérifier les logs
make prod-logs
```

### 5. Vérifier que tout fonctionne

- Visiter https://kotoba.ovh dans un navigateur
- Vérifier que l'API répond: `curl https://kotoba.ovh/api/health`

## Commandes utiles

```bash
# Démarrer les services
make prod-up

# Arrêter les services
make prod-down

# Voir les logs
make prod-logs

# Redémarrer les services
make prod-restart

# Reconstruire après des modifications
make prod-build
make prod-up
```

## Mise à jour

Pour mettre à jour l'application:

```bash
# Récupérer les dernières modifications
git pull

# Reconstruire et redémarrer
make prod-build
make prod-up
```

## Renouvellement des certificats SSL (Let's Encrypt)

Les certificats Let's Encrypt expirent après 90 jours. Pour les renouveler:

```bash
sudo certbot renew
sudo cp /etc/letsencrypt/live/kotoba.ovh/fullchain.pem nginx/ssl/kotoba.ovh.crt
sudo cp /etc/letsencrypt/live/kotoba.ovh/privkey.pem nginx/ssl/kotoba.ovh.key
make prod-restart
```

Il est recommandé d'automatiser le renouvellement avec un cron job:

```bash
# Éditer le crontab
sudo crontab -e

# Ajouter cette ligne pour renouveler automatiquement et redémarrer nginx
0 0 * * * certbot renew --quiet && cp /etc/letsencrypt/live/kotoba.ovh/fullchain.pem /path/to/kotoba/nginx/ssl/kotoba.ovh.crt && cp /etc/letsencrypt/live/kotoba.ovh/privkey.pem /path/to/kotoba/nginx/ssl/kotoba.ovh.key && cd /path/to/kotoba && make prod-restart
```

## Configuration de la session en production

Le fichier `apps/api/src/index.ts` utilise `secure: false` pour les cookies de session en développement. 
En production avec HTTPS, vous pouvez modifier pour utiliser `secure: true` en fonction de la variable d'environnement:

```typescript
cookie: {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 24,
},
```

## Dépannage

### Vérifier que les containers sont en cours d'exécution

```bash
docker ps | grep kotoba
```

### Vérifier les logs d'un service spécifique

```bash
docker logs kotoba-api
docker logs kotoba-web
docker logs kotoba-nginx
```

### Tester la connexion à l'API

```bash
curl http://localhost:3001/api/health
```

### Vérifier la configuration nginx

```bash
docker exec kotoba-nginx nginx -t
```

