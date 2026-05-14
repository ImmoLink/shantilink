import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'sl_expense_history';
const HISTORY_LIMIT = 50;

/**
 * Sauvegarde une dépense dans l'historique local (max 50 entrées).
 * Appeler après chaque createExpense réussi.
 */
export async function recordExpense(expense) {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    history.unshift({
      description: expense.description || '',
      montant: parseFloat(expense.montant) || 0,
      categorie: expense.categorie || '',
      date: expense.date || new Date().toISOString().split('T')[0],
    });
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (_) {}
}

/**
 * Calcule les suggestions depuis les 50 dernières dépenses.
 * Entièrement local, aucun appel réseau.
 *
 * Retourne :
 * {
 *   topFournisseurs: [{ label: string, count: number }],
 *   topMontants:     [{ montant: number, count: number }],
 *   topCategories:   [{ categorie: string, count: number }],
 *   categorieProbable: string | null,
 * }
 */
export async function computeSuggestions(projectContext = '') {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return emptySuggestions();

    const history = JSON.parse(raw);
    if (!history.length) return emptySuggestions();

    // ── Fournisseurs (extraits du champ description) ─────────────────
    const descCount = {};
    for (const e of history) {
      const desc = e.description?.trim();
      if (desc && desc.length > 2) {
        const key = extractFournisseur(desc);
        if (key) descCount[key] = (descCount[key] || 0) + 1;
      }
    }
    const topFournisseurs = Object.entries(descCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, count }));

    // ── Montants ─────────────────────────────────────────────────────
    const montantCount = {};
    for (const e of history) {
      const m = e.montant;
      if (m && m > 0) {
        const rounded = roundToSignificant(m);
        montantCount[rounded] = (montantCount[rounded] || 0) + 1;
      }
    }
    const topMontants = Object.entries(montantCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([montant, count]) => ({ montant: parseFloat(montant), count }));

    // ── Catégories ───────────────────────────────────────────────────
    const catCount = {};
    for (const e of history) {
      if (e.categorie) catCount[e.categorie] = (catCount[e.categorie] || 0) + 1;
    }
    const topCategories = Object.entries(catCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categorie, count]) => ({ categorie, count }));

    // Catégorie contextuelle si le projet est mentionné
    const categorieProbable = inferCategorieFromContext(projectContext, topCategories[0]?.categorie);

    return { topFournisseurs, topMontants, topCategories, categorieProbable };
  } catch (_) {
    return emptySuggestions();
  }
}

function emptySuggestions() {
  return { topFournisseurs: [], topMontants: [], topCategories: [], categorieProbable: null };
}

/** Extraire le fournisseur probable (mots majuscules ou après "chez") */
function extractFournisseur(description) {
  const chezMatch = description.match(/(?:chez|from|de chez)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i);
  if (chezMatch) return capitalize(chezMatch[1]);

  // Mots tous-caps de plus de 3 caractères (ex: BRICO, SONASID)
  const capsMatch = description.match(/\b([A-Z]{3,})\b/);
  if (capsMatch) return capsMatch[1];

  // Premier mot significatif
  const words = description.split(/\s+/).filter(w => w.length > 3);
  return words[0] ? capitalize(words[0]) : null;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Arrondi aux chiffres significatifs pour regrouper les montants proches */
function roundToSignificant(n) {
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 1000) return Math.round(n / 50) * 50;
  return Math.round(n / 100) * 100;
}

/** Déduit la catégorie probable selon les mots-clés du projet */
function inferCategorieFromContext(context, fallback) {
  if (!context) return fallback;
  const lower = context.toLowerCase();
  if (/élec|kahr|câbl|tableau|fil/i.test(lower)) return 'Équipement';
  if (/plomb|tuyau|sabak|robinet/i.test(lower)) return "Main d'œuvre";
  if (/peintur|lwan|couleur/i.test(lower)) return 'Matériaux';
  if (/transport|camion|livraison/i.test(lower)) return 'Transport';
  return fallback;
}
