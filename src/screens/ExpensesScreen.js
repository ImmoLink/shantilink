import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, Alert, RefreshControl, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import Card from '../components/Card';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useAutoDraft } from '../hooks/useAutoDraft';
import DraftBanner, { SavedIndicator } from '../components/ui/DraftBanner';
import QuickTileSelector, { EXPENSE_CAT_TILES } from '../components/ui/QuickTileSelector';
import PhotoCaptureButton from '../components/ui/PhotoCaptureButton';
import VoiceInputButton from '../components/ui/VoiceInputButton';
import { recordExpense, computeSuggestions } from '../services/suggestions';

const CATS = ['Matériaux', "Main d'œuvre", 'Équipement', 'Transport', 'Honoraires', 'Autre'];
const TODAY = new Date().toISOString().split('T')[0];
const DRAFT_INITIAL = { desc: '', montant: '', cat: CATS[0], date: TODAY };

export default function ExpensesScreen() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  // ── Auto-draft ──────────────────────────────────────────────────────────────
  const draftKey = `draft_expense_${user?.id ?? 'guest'}`;
  const {
    draft, updateDraft, resumeDraft, clearDraft,
    hasDraft, pendingDraft, lastSavedAt, savedVisible,
  } = useAutoDraft(draftKey, DRAFT_INITIAL);

  // ── Load expenses ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const e = await API.getExpenses();
      setExpenses(e.filter(x => !x.deleted));
    } catch (e) {
      Alert.alert('Erreur de chargement', 'Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // Load suggestions when modal opens
  useEffect(() => {
    if (showAdd) {
      computeSuggestions().then(setSuggestions).catch(() => {});
    }
  }, [showAdd]);

  // ── Totals ───────────────────────────────────────────────────────────────────
  const total = expenses.reduce((s, e) => s + (e.montant || 0), 0);
  const byCat = CATS.map(c => ({
    name: c,
    total: expenses.filter(e => e.categorie === c).reduce((s, e) => s + e.montant, 0),
    count: expenses.filter(e => e.categorie === c).length,
  })).filter(c => c.count > 0);

  // ── Open/close modal ─────────────────────────────────────────────────────────
  const openModal = useCallback(() => setShowAdd(true), []);
  const closeModal = useCallback(() => setShowAdd(false), []);

  // ── Create expense ───────────────────────────────────────────────────────────
  const create = async () => {
    if (!draft.desc.trim() || !draft.montant) {
      Alert.alert('Champs manquants', 'La description et le montant sont obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        description: draft.desc,
        montant: parseFloat(draft.montant),
        categorie: draft.cat,
        date: draft.date,
      };
      await API.createExpense(payload);
      await recordExpense(payload);
      await clearDraft();
      closeModal();
      await load();
    } catch (_) {
      Alert.alert('Pas de connexion', 'Ta saisie est sauvegardée — on l\'enverra plus tard.');
    } finally {
      setSaving(false);
    }
  };

  // ── AI auto-fill ─────────────────────────────────────────────────────────────
  const handleAIResult = useCallback((data) => {
    const updates = {};
    if (data.montant)     updates.montant = String(data.montant);
    if (data.description) updates.desc = data.description;
    if (data.categorie && CATS.includes(data.categorie)) updates.cat = data.categorie;
    if (data.date)        updates.date = data.date;
    if (data.fournisseur && !updates.desc) updates.desc = data.fournisseur;
    updateDraft(updates);
  }, [updateDraft]);

  // ── Delete ────────────────────────────────────────────────────────────────────
  const del = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette dépense ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try { await API.deleteExpense(id); await load(); }
          catch (_) { Alert.alert('Erreur', 'Impossible de supprimer. Réessaie.'); }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>💰 Budget & Dépenses</Text>
            <Text style={styles.pageSub}>{expenses.length} dépense{expenses.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openModal}>
            <Text style={styles.addBtnTxt}>+ Ajouter</Text>
          </TouchableOpacity>
        </View>

        {/* Total card */}
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL DÉPENSES</Text>
          <Text style={styles.totalValue}>{total.toLocaleString('fr-FR')} DH</Text>
          <Text style={styles.totalSub}>{expenses.length} transaction{expenses.length !== 1 ? 's' : ''}</Text>
        </Card>

        {/* By category */}
        {byCat.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Répartition par catégorie</Text>
            {byCat.map(c => (
              <View key={c.name} style={styles.catRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catName}>{c.name}</Text>
                  <Text style={styles.catCount}>{c.count} dépense{c.count !== 1 ? 's' : ''}</Text>
                </View>
                <Text style={styles.catTotal}>{c.total.toLocaleString('fr-FR')} DH</Text>
                <Text style={styles.catPct}>{total ? Math.round(c.total / total * 100) : 0}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expense list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Toutes les dépenses</Text>
          {expenses.length === 0 ? (
            <Card style={styles.empty}>
              <Text style={styles.emptyTxt}>Aucune dépense enregistrée.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openModal}>
                <Text style={styles.emptyBtnTxt}>+ Ajouter une dépense</Text>
              </TouchableOpacity>
            </Card>
          ) : (
            expenses.map(e => (
              <Card key={e.id} style={[styles.expCard, e.description?.startsWith('[Brouillon]') && styles.expCardDraft]}>
                <View style={styles.expRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expDesc}>
                      {e.description?.replace('[Brouillon] ', '') || '—'}
                      {e.description?.startsWith('[Brouillon]') && (
                        <Text style={styles.draftBadge}> ✎ Brouillon</Text>
                      )}
                    </Text>
                    <View style={styles.expMeta}>
                      <Text style={styles.expCat}>{e.categorie}</Text>
                      {e.date ? <Text style={styles.expDate}>{new Date(e.date).toLocaleDateString('fr-FR')}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.expRight}>
                    <Text style={styles.expMontant}>{e.montant.toLocaleString('fr-FR')} DH</Text>
                    <TouchableOpacity onPress={() => del(e.id)} style={styles.delTouch}>
                      <Text style={styles.expDel}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nouvelle dépense</Text>
            <View style={styles.modalHeaderRight}>
              {/* Voice input */}
              <VoiceInputButton
                onResult={handleAIResult}
                style={styles.voiceBtn}
              />
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Draft banner */}
            <DraftBanner
              hasDraft={hasDraft}
              lastSavedAt={lastSavedAt}
              pendingDraft={pendingDraft}
              onResume={resumeDraft}
              onDiscard={clearDraft}
            />

            {/* Photo capture */}
            <PhotoCaptureButton onResult={handleAIResult} />

            {/* Suggestions — fournisseurs */}
            {suggestions?.topFournisseurs?.length > 0 && (
              <View style={styles.suggestRow}>
                <Text style={styles.suggestLabel}>Souvent chez :</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {suggestions.topFournisseurs.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.chip}
                      onPress={() => updateDraft({ desc: s.label })}
                    >
                      <Text style={styles.chipTxt}>{s.label} →</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Description */}
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.input, draft.desc && styles.inputFilled]}
              value={draft.desc}
              onChangeText={v => updateDraft({ desc: v })}
              placeholder="Achat ciment, carrelage…"
              returnKeyType="next"
            />

            {/* Montant */}
            <Text style={styles.label}>Montant (DH) *</Text>

            {/* Suggestions montants */}
            {suggestions?.topMontants?.length > 0 && (
              <View style={styles.suggestRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {suggestions.topMontants.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.chip}
                      onPress={() => updateDraft({ montant: String(s.montant) })}
                    >
                      <Text style={styles.chipTxt}>{s.montant.toLocaleString('fr-FR')} DH →</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <TextInput
              style={[styles.input, styles.amountInput, draft.montant && styles.inputFilled]}
              value={draft.montant}
              onChangeText={v => updateDraft({ montant: v })}
              placeholder="0"
              keyboardType="numeric"
              returnKeyType="done"
            />

            {/* Catégorie — Quick Tiles */}
            <Text style={styles.label}>Catégorie</Text>
            <QuickTileSelector
              tiles={EXPENSE_CAT_TILES}
              selected={draft.cat}
              onSelect={v => updateDraft({ cat: v })}
              multiSelect={false}
              columns={3}
              tileHeight={72}
            />

            {/* Date */}
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={[styles.input, draft.date !== TODAY && styles.inputFilled]}
              value={draft.date}
              onChangeText={v => updateDraft({ date: v })}
              placeholder="2025-01-01"
            />

            {/* Submit */}
            <TouchableOpacity style={styles.saveBtn} onPress={create} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.navy} />
                : <Text style={styles.saveBtnTxt}>💾 Enregistrer la dépense</Text>
              }
            </TouchableOpacity>
          </ScrollView>

          {/* "Sauvegardé ✓" indicator */}
          <SavedIndicator visible={savedVisible} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 100 },

  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.ink },
  pageSub: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  addBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, paddingVertical: 9, paddingHorizontal: 16 },
  addBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 13 },

  totalCard: { backgroundColor: Colors.navy, alignItems: 'center', paddingVertical: 24, marginBottom: Spacing.md },
  totalLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' },
  totalValue: { fontSize: 32, fontWeight: '700', color: Colors.gold, marginVertical: 4 },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },

  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border, gap: 8 },
  catName: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  catCount: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  catTotal: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  catPct: { fontSize: 11, color: Colors.muted, width: 34, textAlign: 'right' },

  expCard: { marginBottom: 6 },
  expCardDraft: { borderLeftWidth: 3, borderLeftColor: Colors.amber },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expDesc: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  draftBadge: { fontSize: 10, color: Colors.amber, fontWeight: '700' },
  expMeta: { flexDirection: 'row', gap: 8, marginTop: 3 },
  expCat: { fontSize: 10, color: Colors.gold, fontWeight: '700', backgroundColor: 'rgba(232,184,75,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  expDate: { fontSize: 11, color: Colors.muted },
  expRight: { alignItems: 'flex-end', gap: 4 },
  expMontant: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  delTouch: { padding: 4, minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  expDel: { fontSize: 14, color: Colors.red, fontWeight: '700' },

  empty: { alignItems: 'center', padding: 24 },
  emptyTxt: { fontSize: 13, color: Colors.muted, marginBottom: 12 },
  emptyBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, paddingVertical: 9, paddingHorizontal: 20 },
  emptyBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 13 },

  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  modalHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink, flex: 1 },
  modalCloseBtn: { padding: 4, minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  modalClose: { fontSize: 20, color: Colors.muted },
  voiceBtn: {},
  modalScroll: { padding: Spacing.md, paddingBottom: 60 },

  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, fontSize: 14, color: Colors.ink, borderWidth: 0.5, borderColor: Colors.border, minHeight: 48 },
  inputFilled: { borderColor: Colors.gold, backgroundColor: 'rgba(232,184,75,0.05)' },
  amountInput: { fontSize: 22, fontWeight: '700' },

  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  suggestLabel: { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  chip: { backgroundColor: Colors.goldLight, borderRadius: Radius.full, paddingVertical: 5, paddingHorizontal: 12, marginRight: 6, minHeight: 30, justifyContent: 'center' },
  chipTxt: { fontSize: 12, color: Colors.amber, fontWeight: '600' },

  saveBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 14, alignItems: 'center', marginTop: 24, minHeight: 52, justifyContent: 'center', ...Shadow.sm },
  saveBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
});
