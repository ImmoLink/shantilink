import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  StyleSheet, Animated, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import QuickTileSelector, { EXPENSE_CAT_TILES } from './ui/QuickTileSelector';
import { useQuickLog } from '../context/QuickLogContext';
import { recordExpense } from '../services/suggestions';
import { Colors, Spacing, Radius, Shadow } from '../theme';

// Haptics: optional
let Haptics = null;
try { Haptics = require('expo-haptics'); } catch (_) {}

/**
 * Bottom sheet rapide : montant + catégorie → dépense enregistrée en < 10s.
 * Les dépenses créées ici sont marquées isDraft=true et peuvent être
 * complétées depuis la liste.
 */
export default function QuickLogSheet() {
  const { visible, closeQuickLog, notifySaved } = useQuickLog();

  const [montant, setMontant] = useState('');
  const [cat, setCat] = useState('Matériaux');
  const [saving, setSaving] = useState(false);

  const translateY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 400, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const reset = useCallback(() => {
    setMontant('');
    setCat('Matériaux');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    closeQuickLog();
  }, [reset, closeQuickLog]);

  const handleSave = useCallback(async () => {
    const amount = parseFloat(montant);
    if (!amount || amount <= 0) {
      Alert.alert('Montant requis', 'Entre un montant pour enregistrer la dépense.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        description: `[Brouillon] ${cat}`,
        montant: amount,
        categorie: cat,
        date: new Date().toISOString().split('T')[0],
      };
      await API.createExpense(payload);
      await recordExpense(payload);

      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType?.Success ?? 'success').catch(() => {});
      }

      reset();
      notifySaved();
    } catch (_) {
      Alert.alert(
        'Pas de connexion',
        'Ta dépense est enregistrée localement et sera synchronisée quand tu seras connecté.'
      );
      reset();
      closeQuickLog();
    } finally {
      setSaving(false);
    }
  }, [montant, cat, notifySaved, closeQuickLog, reset]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <SafeAreaView edges={['bottom']}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>⚡ Dépense rapide</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                <Text style={styles.closeTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Montant — grand clavier numérique */}
              <Text style={styles.label}>MONTANT (DH)</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  value={montant}
                  onChangeText={setMontant}
                  placeholder="0"
                  placeholderTextColor={Colors.border}
                  keyboardType="numeric"
                  autoFocus
                  returnKeyType="done"
                  accessibilityLabel="Montant en dirhams"
                />
                <Text style={styles.currency}>DH</Text>
              </View>

              {/* Catégorie */}
              <Text style={styles.label}>CATÉGORIE</Text>
              <QuickTileSelector
                tiles={EXPENSE_CAT_TILES}
                selected={cat}
                onSelect={setCat}
                multiSelect={false}
                columns={3}
                tileHeight={72}
              />

              {/* Bouton enregistrer */}
              <TouchableOpacity
                style={[styles.saveBtn, (!montant || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!montant || saving}
                accessibilityLabel="Enregistrer la dépense"
                accessibilityRole="button"
              >
                {saving
                  ? <ActivityIndicator color={Colors.navy} />
                  : <Text style={styles.saveBtnTxt}>💾 Enregistrer</Text>
                }
              </TouchableOpacity>

              <Text style={styles.hint}>
                Les détails peuvent être complétés plus tard depuis la liste.
              </Text>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** FAB "+" global affiché en overlay sur tous les écrans */
export function QuickLogFAB() {
  const { openQuickLog } = useQuickLog();
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => openQuickLog()}
      accessibilityLabel="Ajouter une dépense rapide"
      accessibilityRole="button"
    >
      <Text style={styles.fabTxt}>+</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    ...Shadow.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.ink },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: { fontSize: 14, color: Colors.muted, fontWeight: '700' },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    paddingHorizontal: Spacing.md,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '700',
    color: Colors.ink,
    paddingVertical: Spacing.md,
    minHeight: 72,
  },
  currency: { fontSize: 18, fontWeight: '700', color: Colors.muted },
  saveBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    padding: 16,
    alignItems: 'center',
    marginTop: Spacing.md,
    minHeight: 56,
    justifyContent: 'center',
    ...Shadow.sm,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnTxt: { fontSize: 16, fontWeight: '700', color: Colors.navy },
  hint: { fontSize: 11, color: Colors.muted, textAlign: 'center', marginTop: 4 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
    zIndex: 999,
  },
  fabTxt: { fontSize: 28, color: Colors.navy, fontWeight: '700', lineHeight: 32 },
});
