# ShantiLink Mobile — Guide de démarrage

## Prérequis
- Node.js 18+ installé ✅
- Application Expo Go sur votre téléphone (iOS ou Android)
  → App Store : "Expo Go"
  → Play Store : "Expo Go"

## Lancer l'application

### 1. Démarrer le serveur backend
```
cd C:\Users\elhil\OneDrive\Desktop\Data_IA\BnaLink\app
start.bat
```

### 2. Configurer l'IP du serveur (réseau local)
Ouvrez `src/api.js` et remplacez :
```js
export const BASE_URL = 'http://localhost:8000/api';
```
par l'IP locale de votre PC (ex: 192.168.1.10) :
```js
export const BASE_URL = 'http://192.168.1.10:8000/api';
```
Trouvez votre IP avec : `ipconfig` → IPv4

### 3. Lancer l'app mobile
```
cd mobile
npx expo start
```

### 4. Scanner le QR code
- Ouvrez Expo Go sur votre téléphone
- Scannez le QR code affiché dans le terminal
- L'app se charge directement sur votre téléphone !

## Build APK (Android) — Production
```
npx expo build:android
# ou avec EAS (recommandé)
npx eas build --platform android
```

## Fonctionnalités disponibles
- ✅ Authentification (login / inscription)
- ✅ Tableau de bord avec KPIs et activité récente
- ✅ Gestion des projets (créer, modifier, avancement)
- ✅ Budget & dépenses (catégories, totaux)
- ✅ Annuaire pros (appel direct + WhatsApp)
- ✅ Demandes de devis (clients publient, pros répondent)
- ✅ Profil + système de parrainage + badge Membre Fondateur
- ✅ Statistiques plateforme en temps réel

## Architecture
```
mobile/
├── App.js              → Navigation principale
├── src/
│   ├── api.js          → Client API (même backend que le web)
│   ├── theme.js        → Couleurs & design tokens
│   ├── context/
│   │   └── AuthContext.js  → State d'authentification
│   └── screens/
│       ├── AuthScreen.js
│       ├── HomeScreen.js
│       ├── ProjectsScreen.js
│       ├── ExpensesScreen.js
│       ├── ProsScreen.js
│       ├── BriefsScreen.js
│       └── ProfileScreen.js
```
