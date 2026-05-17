import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import Card from '../components/Card';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useAutoDraft } from '../hooks/useAutoDraft';
import DraftBanner, { SavedIndicator } from '../components/ui/DraftBanner';
import QuickTileSelector, { PROGRESS_TILES } from '../components/ui/QuickTileSelector';

const TYPES = ['Villa / Maison individuelle', 'Appartement', 'Immeuble R+', 'Local commercial', 'Autre'];
const DRAFT_INITIAL = { nom: '', ville: '', budget: '', type: TYPES[0], desc: '' };

const EXP_CATS = [
  { id: 'mat', label: 'Matériaux',    icon: '🧱' },
  { id: 'mo',  label: "Main d'œuvre", icon: '👷' },
  { id: 'eq',  label: 'Équipement',   icon: '🔧' },
  { id: 'tr',  label: 'Transport',    icon: '🚚' },
  { id: 'ho',  label: 'Honoraires',   icon: '📋' },
  { id: 'au',  label: 'Autre',        icon: '📦' },
];
const EXP_INITIAL = { description: '', montant: '', categorie: 'Matériaux' };

export default function ProjectsScreen({ route }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(route.params?.openAdd || false);
  const [saving, setSaving] = useState(false);
  const [pctModal, setPctModal] = useState(null);
  const [pctInput, setPctInput] = useState('');

  const [allExpenses, setAllExpenses] = useState([]);
  const [expenseModal, setExpenseModal] = useState(null); // { projectId, nom }
  const [expForm, setExpForm] = useState(EXP_INITIAL);
  const [expSaving, setExpSaving] = useState(false);

  // ── Auto-draft ──────────────────────────────────────────────────────────────
  const draftKey = `draft_project_${user?.id ?? 'guest'}`;
  const {
    draft, updateDraft, resumeDraft, clearDraft,
    hasDraft, pendingDraft, lastSavedAt, savedVisible,
  } = useAutoDraft(draftKey, DRAFT_INITIAL);

  // ── Load projects ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([API.getProjects(), API.getExpenses()]);
      setProjects(p);
      setAllExpenses(e);
    } catch (_) {
      Alert.alert('Erreur de chargement', 'Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const projectTotal = (pid) =>
    allExpenses.filter(e => e.project_id === pid).reduce((s, e) => s + (e.montant || 0), 0);

  const openExpense = (projectId, nom) => {
    setExpForm(EXP_INITIAL);
    setExpenseModal({ projectId, nom });
  };

  const saveExpense = async () => {
    const montant = parseFloat(expForm.montant);
    if (!montant || isNaN(montant) || montant <= 0) {
      Alert.alert('Champ manquant', 'Saisis un montant valide.');
      return;
    }
    setExpSaving(true);
    try {
      await API.createExpense({
        project_id: expenseModal.projectId,
        description: expForm.description.trim() || 'Dépense',
        montant,
        categorie: expForm.categorie,
        date: new Date().toISOString().split('T')[0],
      });
      setExpenseModal(null);
      await load();
    } catch (_) {
      Alert.alert('Erreur', 'Impossible d\'enregistrer. Réessaie.');
    } finally {
      setExpSaving(false);
    }
  };

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // ── Create project ───────────────────────────────────────────────────────────
  const create = async () => {
    if (!draft.nom.trim()) {
      Alert.alert('Champ manquant', 'Le nom du projet est obligatoire.');
      return;
    }
    setSaving(true);
    try {
      await API.createProject({
        nom: draft.nom,
        ville: draft.ville,
        budget: parseInt(draft.budget) || 0,
        type: draft.type,
        description: draft.desc,
      });
      await clearDraft();
      setShowAdd(false);
      await load();
    } catch (_) {
      Alert.alert('Pas de connexion', 'Ta saisie est sauvegardée — on l\'enverra plus tard.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const del = (id, name) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try { await API.deleteProject(id); await load(); }
          catch (_) { Alert.alert('Erreur', 'Impossible de supprimer. Réessaie.'); }
        },
      },
    ]);
  };

  // ── Progress ─────────────────────────────────────────────────────────────────
  const openPct = (id, current) => {
    setPctInput(String(current));
    setPctModal({ id, current });
  };

  const submitPct = async () => {
    if (!pctModal) return;
    const pct = Math.min(100, Math.max(0, parseInt(pctInput) || 0));
    try { await API.updatePct(pctModal.id, pct); await load(); }
    catch (_) { Alert.alert('Erreur', 'Impossible de mettre à jour. Réessaie.'); }
    finally { setPctModal(null); }
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
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>🏗️ Mes projets</Text>
            <Text style={styles.pageSub}>{projects.length} projet{projects.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnTxt}>+ Nouveau</Text>
          </TouchableOpacity>
        </View>

        {projects.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏠</Text>
            <Text style={styles.emptyTxt}>Aucun projet pour l'instant.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.emptyBtnTxt}>+ Créer un projet</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          projects.map(p => {
            const total = projectTotal(p.id);
            const budgetPct = p.budget > 0 ? Math.min(100, Math.round((total / p.budget) * 100)) : 0;
            const isOver = p.budget > 0 && total > p.budget;
            return (
              <Card key={p.id}>
                <View style={styles.projHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projName}>{p.nom}</Text>
                    <Text style={styles.projMeta}>📍 {p.ville || 'N/A'} · {p.type}</Text>
                    {p.budget > 0 && <Text style={styles.projBudget}>Budget : {p.budget.toLocaleString('fr-FR')} DH</Text>}
                  </View>
                  <TouchableOpacity style={styles.pctBtn} onPress={() => openPct(p.id, p.pct)}>
                    <Text style={styles.pctTxt}>{p.pct}%</Text>
                    <Text style={styles.pctEdit}>✏️</Text>
                  </TouchableOpacity>
                </View>

                {/* Avancement travaux */}
                <Text style={styles.barLabel}>Avancement</Text>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${p.pct}%` }]} />
                </View>

                {/* Dépenses vs budget */}
                <View style={styles.expRow}>
                  <Text style={styles.barLabel}>Dépenses</Text>
                  <View style={styles.expBadges}>
                    <Text style={[styles.expTotal, isOver && { color: Colors.red }]}>
                      {total.toLocaleString('fr-FR')} DH
                    </Text>
                    {p.budget > 0 && (
                      <Text style={[styles.expPct, isOver && { color: Colors.red, backgroundColor: Colors.redBg }]}>
                        {budgetPct}%
                      </Text>
                    )}
                  </View>
                </View>
                {p.budget > 0 ? (
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                      width: `${budgetPct}%`,
                      backgroundColor: isOver ? Colors.red : Colors.teal,
                    }]} />
                  </View>
                ) : (
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: total > 0 ? '100%' : '0%', backgroundColor: Colors.teal }]} />
                  </View>
                )}

                {p.description ? <Text style={styles.projDesc} numberOfLines={2}>{p.description}</Text> : null}

                <View style={styles.projActions}>
                  <Text style={styles.projDate}>{new Date(p.created_at).toLocaleDateString('fr-FR')}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TouchableOpacity style={styles.depBtn} onPress={() => openExpense(p.id, p.nom)}>
                      <Text style={styles.depBtnTxt}>+ Dépense</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => del(p.id, p.nom)}>
                      <Text style={styles.delBtn}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Progress quick-pick modal */}
      <Modal visible={!!pctModal} transparent animationType="fade">
        <View style={styles.pctOverlay}>
          <View style={styles.pctBox}>
            <Text style={styles.pctBoxTitle}>Avancement du projet</Text>
            {/* Quick tiles for common progress values */}
            <QuickTileSelector
              tiles={PROGRESS_TILES}
              selected={parseInt(pctInput) || 0}
              onSelect={v => setPctInput(String(v))}
              multiSelect={false}
              columns={5}
              tileHeight={60}
            />
            <Text style={styles.pctOrLabel}>ou saisir manuellement :</Text>
            <TextInput
              style={[styles.input, { textAlign: 'center', fontSize: 22, fontWeight: '700', marginBottom: 16 }]}
              value={pctInput}
              onChangeText={setPctInput}
              keyboardType="numeric"
              maxLength={3}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, backgroundColor: Colors.border }]}
                onPress={() => setPctModal(null)}
              >
                <Text style={[styles.saveBtnTxt, { color: Colors.ink }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={submitPct}>
                <Text style={styles.saveBtnTxt}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add expense modal */}
      <Modal visible={!!expenseModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Nouvelle dépense</Text>
              {expenseModal && <Text style={styles.modalSub}>{expenseModal.nom}</Text>}
            </View>
            <TouchableOpacity onPress={() => setExpenseModal(null)} style={styles.modalCloseBtn}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Montant (DH) *</Text>
            <TextInput
              style={[styles.input, expForm.montant && styles.inputFilled]}
              value={expForm.montant}
              onChangeText={v => setExpForm(f => ({ ...f, montant: v }))}
              placeholder="0"
              keyboardType="numeric"
              returnKeyType="next"
              autoFocus
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, expForm.description && styles.inputFilled]}
              value={expForm.description}
              onChangeText={v => setExpForm(f => ({ ...f, description: v }))}
              placeholder="Ciment, ferraillage, plombier…"
              returnKeyType="done"
            />

            <Text style={styles.label}>Catégorie</Text>
            <View style={styles.catGrid}>
              {EXP_CATS.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catTile, expForm.categorie === c.label && styles.catTileSelected]}
                  onPress={() => setExpForm(f => ({ ...f, categorie: c.label }))}
                >
                  <Text style={styles.catIcon}>{c.icon}</Text>
                  <Text style={[styles.catLabel, expForm.categorie === c.label && { color: Colors.gold, fontWeight: '700' }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={saveExpense} disabled={expSaving}>
              {expSaving
                ? <ActivityIndicator color={Colors.navy} />
                : <Text style={styles.saveBtnTxt}>💸 Enregistrer la dépense</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Add project modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nouveau projet</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
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

            <Text style={styles.label}>Nom du projet *</Text>
            <TextInput
              style={[styles.input, draft.nom && styles.inputFilled]}
              value={draft.nom}
              onChangeText={v => updateDraft({ nom: v })}
              placeholder="Villa Ait Melloul, Casablanca…"
              returnKeyType="next"
            />

            <Text style={styles.label}>Ville</Text>
            <TextInput
              style={[styles.input, draft.ville && styles.inputFilled]}
              value={draft.ville}
              onChangeText={v => updateDraft({ ville: v })}
              placeholder="Casablanca"
              returnKeyType="next"
            />

            <Text style={styles.label}>Budget (DH)</Text>
            <TextInput
              style={[styles.input, draft.budget && styles.inputFilled]}
              value={draft.budget}
              onChangeText={v => updateDraft({ budget: v })}
              placeholder="0"
              keyboardType="numeric"
              returnKeyType="done"
            />

            <Text style={styles.label}>Type de projet</Text>
            {TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeOption, draft.type === t && styles.typeSelected]}
                onPress={() => updateDraft({ type: t })}
              >
                <Text style={[styles.typeOptionTxt, draft.type === t && { color: Colors.gold, fontWeight: '600' }]}>{t}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }, draft.desc && styles.inputFilled]}
              value={draft.desc}
              onChangeText={v => updateDraft({ desc: v })}
              placeholder="Détails du projet…"
              multiline
            />

            <TouchableOpacity style={styles.saveBtn} onPress={create} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.navy} />
                : <Text style={styles.saveBtnTxt}>🏗️ Créer le projet</Text>
              }
            </TouchableOpacity>
          </ScrollView>

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

  empty: { alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTxt: { fontSize: 14, color: Colors.muted, marginBottom: 16 },
  emptyBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, paddingVertical: 10, paddingHorizontal: 24 },
  emptyBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 13 },

  projHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  projName: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  projMeta: { fontSize: 11, color: Colors.muted, marginTop: 3 },
  projBudget: { fontSize: 12, color: Colors.blue, marginTop: 3, fontWeight: '600' },
  pctBtn: { alignItems: 'center', padding: 8, backgroundColor: 'rgba(232,184,75,0.12)', borderRadius: Radius.md, minWidth: 56, minHeight: 48 },
  pctTxt: { fontSize: 16, fontWeight: '700', color: Colors.gold },
  pctEdit: { fontSize: 10, marginTop: 2 },
  progressBg: { height: 5, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 5, backgroundColor: Colors.gold, borderRadius: 3 },
  projDesc: { fontSize: 12, color: Colors.muted, lineHeight: 18 },
  projActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  projDate: { fontSize: 11, color: Colors.muted },
  delBtn: { fontSize: 12, color: Colors.red, fontWeight: '600' },

  barLabel: { fontSize: 10, color: Colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, marginTop: 6 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expTotal: { fontSize: 12, fontWeight: '700', color: Colors.teal },
  expPct: { fontSize: 10, fontWeight: '700', color: Colors.teal, backgroundColor: 'rgba(29,158,117,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  depBtn: { backgroundColor: 'rgba(232,184,75,0.15)', borderRadius: Radius.full, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 0.5, borderColor: Colors.gold },
  depBtnTxt: { fontSize: 12, color: Colors.gold, fontWeight: '700' },

  modalSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  catTile: { width: '30%', flexGrow: 1, alignItems: 'center', padding: 10, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white, minHeight: 60, justifyContent: 'center' },
  catTileSelected: { borderColor: Colors.gold, backgroundColor: 'rgba(232,184,75,0.08)' },
  catIcon: { fontSize: 20, marginBottom: 4 },
  catLabel: { fontSize: 10, color: Colors.ink, textAlign: 'center', fontWeight: '500' },

  pctOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  pctBox: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%' },
  pctBoxTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink, textAlign: 'center', marginBottom: Spacing.md },
  pctOrLabel: { fontSize: 11, color: Colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 4 },

  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  modalCloseBtn: { padding: 4, minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  modalClose: { fontSize: 20, color: Colors.muted },
  modalScroll: { padding: Spacing.md, paddingBottom: 60 },

  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, fontSize: 14, color: Colors.ink, borderWidth: 0.5, borderColor: Colors.border, minHeight: 48 },
  inputFilled: { borderColor: Colors.gold, backgroundColor: 'rgba(232,184,75,0.05)' },
  typeOption: { padding: 11, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.white, minHeight: 48, justifyContent: 'center' },
  typeSelected: { borderColor: Colors.gold, backgroundColor: 'rgba(232,184,75,0.08)' },
  typeOptionTxt: { fontSize: 13, color: Colors.ink },
  saveBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 14, alignItems: 'center', marginTop: 24, minHeight: 52, justifyContent: 'center', ...Shadow.sm },
  saveBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
});
