import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TIMEOUT_MS = 10_000;

/**
 * Analyse une image via le backend ShantiLink (qui appelle Claude côté serveur).
 * La clé Anthropic reste côté serveur — jamais exposée dans l'app mobile.
 */
export async function analyzeReceiptImage(base64Image, mediaType = 'image/jpeg') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const token = await AsyncStorage.getItem('sl_token');
    const response = await fetch(`${API_URL}/api/analyze-receipt`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ image: base64Image, media_type: mediaType }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Erreur serveur ${response.status}`);
    }

    const json = await response.json();
    return json.result ?? null;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Map la catégorie renvoyée par Claude vers les valeurs UI de l'app.
 */
export function mapCategorieToUI(cat) {
  const map = {
    materiaux:   'Matériaux',
    maindoeuvre: "Main d'œuvre",
    transport:   'Transport',
    equipement:  'Équipement',
    autre:       'Autre',
  };
  return map[cat] ?? 'Autre';
}
