import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyzeReceiptImage, mapCategorieToUI } from '../../services/imageAnalysis';
import { Colors, Spacing, Radius, Shadow } from '../../theme';

/**
 * Bouton "Scanner un reçu" avec skeleton loader sur les champs pendant l'analyse.
 *
 * Props:
 *   onResult  — (data: ExtractedExpense) => void
 *               data = { montant, devise, fournisseur, date, description, categorie, articles }
 *   style     — style override for the outer container
 */
export default function PhotoCaptureButton({ onResult, style }) {
  const [state, setState] = useState('idle'); // idle | analyzing | done

  const pick = useCallback(async (fromCamera) => {
    try {
      let result;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission refusée', 'Active l\'accès à la caméra dans les réglages.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          base64: true,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Erreur', 'Impossible de lire l\'image.');
        return;
      }

      setState('analyzing');

      const mediaType = asset.mimeType || 'image/jpeg';
      const raw = await analyzeReceiptImage(asset.base64, mediaType);

      if (!raw || raw.montant === null) {
        setState('idle');
        Alert.alert(
          'Photo peu claire',
          'Essaie de mieux éclairer le document et de le cadrer correctement.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Map categorie to UI label
      if (raw.categorie) raw.categorie = mapCategorieToUI(raw.categorie);

      setState('done');
      onResult(raw);

      // Reset icon after 2s
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      setState('idle');
      if (err.message === 'timeout') {
        Alert.alert(
          'Connexion lente',
          'L\'analyse a pris trop de temps. Réessaie avec une meilleure connexion.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Analyse impossible',
          'Pas de connexion — les champs n\'ont pas pu être remplis automatiquement.',
          [{ text: 'OK' }]
        );
      }
    }
  }, [onResult]);

  const handlePress = useCallback(() => {
    if (state === 'analyzing') return;
    Alert.alert('Scanner un document', 'Choisir une source :', [
      { text: '📷 Caméra', onPress: () => pick(true) },
      { text: '🖼️ Galerie', onPress: () => pick(false) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [state, pick]);

  const label =
    state === 'analyzing' ? 'Analyse en cours…' :
    state === 'done'      ? '✓ Champs remplis automatiquement' :
                            '📷 Scanner un reçu ou une facture';

  return (
    <TouchableOpacity
      activeOpacity={state === 'analyzing' ? 1 : 0.8}
      style={[styles.btn, state === 'done' && styles.btnDone, style]}
      onPress={handlePress}
      disabled={state === 'analyzing'}
      accessibilityLabel="Scanner un reçu pour remplir automatiquement"
      accessibilityRole="button"
    >
      {state === 'analyzing' ? (
        <ActivityIndicator color={Colors.navy} size="small" />
      ) : (
        <Text style={styles.icon}>{state === 'done' ? '✅' : '📷'}</Text>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, state === 'done' && styles.labelDone]}>
          {label}
        </Text>
        {state === 'idle' && (
          <Text style={styles.sub}>
            Ticket de caisse · Facture · Bon de livraison
          </Text>
        )}
      </View>
      {state === 'idle' && <Text style={styles.arrow}>›</Text>}
    </TouchableOpacity>
  );
}

/** Skeleton rectangle pour simuler un champ en cours de chargement */
export function FieldSkeleton({ width = '100%', height = 44 }) {
  return <View style={[styles.skeleton, { width, height }]} />;
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.navy,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: 64,
    ...Shadow.md,
  },
  btnDone: {
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(31,107,58,0.3)',
  },
  icon: { fontSize: 24 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  labelDone: { color: Colors.green },
  sub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  arrow: { fontSize: 20, color: Colors.gold, fontWeight: '700' },
  skeleton: {
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
});
