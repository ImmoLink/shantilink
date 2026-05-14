import { ANTHROPIC_API_KEY } from '../config';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';
const TIMEOUT_MS = 10_000;

const EXTRACTION_PROMPT = `Tu es un assistant BTP marocain. L'utilisateur parle en français ou en darija marocaine.
Extrais les informations financières et de chantier depuis ce texte transcrit.
Retourne UNIQUEMENT un objet JSON valide :

{
  "montant": <nombre ou null>,
  "devise": "MAD" | "EUR" | null,
  "fournisseur": <string ou null>,
  "date": <"YYYY-MM-DD" ou null>,
  "description": <string ou null>,
  "categorie": "materiaux" | "maindoeuvre" | "transport" | "equipement" | "autre" | null
}

Exemples de darija :
- "khems miyya d reaux d lhajra" → montant: 500, devise: "MAD", categorie: "materiaux", description: "Pierres"
- "alf d lhlib d bina" → montant: 1000, devise: "MAD", description: "Lait de chaux", categorie: "materiaux"
- "miyyatayn u khemsin dyal khdama" → montant: 250, devise: "MAD", categorie: "maindoeuvre"

Si la date est "aujourd'hui" ou "lyoum" → utilise la date du jour : ${new Date().toISOString().split('T')[0]}
Retourne SEULEMENT le JSON.`;

/**
 * Extrait les données structurées d'une transcription vocale via Claude.
 */
export async function extractFromTranscription(transcription) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: `Transcription : "${transcription}"` }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);

    const json = await response.json();
    const raw = json.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lance un enregistrement audio via expo-av et retourne le fichier URI.
 * Nécessite : npx expo install expo-av
 * Retourne null si expo-av n'est pas installé.
 */
export async function startRecording() {
  try {
    const { Audio } = require('expo-av');
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    return recording;
  } catch (_) {
    return null;
  }
}

export async function stopRecording(recording) {
  try {
    await recording.stopAndUnloadAsync();
    return recording.getURI();
  } catch (_) {
    return null;
  }
}
