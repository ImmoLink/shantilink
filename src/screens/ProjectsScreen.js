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

export default function ProjectsScreen({ route }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(route.params?.openAdd || false);
  const [saving, setSaving] = useState(false);
  const [pctModal, setPctModal] = useState(null);
  const [pctInput, setPctInput] = useState('');

  // ── Auto-draft ──────────────────────────────────────────────────────────────
  const draftKey = `draft_project_${user?.id ?? 'guest'}`;
  const {
    draft, updateDraft, resumeDraft, clearDraft,
    hasDraft, pendingDraft, lastSavedAt, savedVisible,
  } = useAutoDraft(draftKey, DRAFT_INITIAL);

  // ── Load projects ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const p = await API.getProjects();
      setProjects(p);
    } catch (_) {
      Alert.alert('Erreur de chargement', 'Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
          projects.map(p => (
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
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${p.pct}%` }]} />
              </View>
              {p.description ? <Text style={styles.projDesc} numberOfLines={2}>{p.description}</Text> : null}
              <View style={styles.projActions}>
                <Text style={styles.projDate}>{new Date(p.created_at).toLocaleDateString('fr-FR')}</Text>
                <TouchableOpacity onPress={() => del(p.id, p.nom)}>
                  <Text style={styles.delBtn}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
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
  projActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  projDate: { fontSize: 11, color: Colors.muted },
  delBtn: { fontSize: 12, color: Colors.red, fontWeight: '600' },

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
