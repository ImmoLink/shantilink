// Serveur backend ShantiLink
// PRODUCTION (Render)       → 'https://shantilink.onrender.com'
// TEST WEB (même PC)        → 'http://localhost:8000'
// TEST TÉLÉPHONE (Wi-Fi)    → 'http://192.168.1.66:8000'
export const API_URL = 'https://shantilink.onrender.com';

// Clé Anthropic — remplace par ta vraie clé ou configure EXPO_PUBLIC_ANTHROPIC_API_KEY dans .env
export const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || 'sk-ant-CONFIGURE_MOI';
