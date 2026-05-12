import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, Alert, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import Card from '../components/Card';
import { Colors, Spacing, Radius } from '../theme';

const TYPES = ['Villa / Maison individuelle','Appartement','Immeuble R+','Local commercial','Autre'];

export default function ProjectsScreen({ route }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(route.params?.openAdd || false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('');
  const [budget, setBudget] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [desc, setDesc] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await API.getProjects();
      setProjects(p);
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const create = async () => {
    if (!nom.trim()) { Alert.alert('Requis', 'Le nom du projet est requis'); return; }
    setSaving(true);
    try {
      await API.createProject({ nom, ville, budget: parseInt(budget)||0, type, description: desc });
      setShowAdd(false);
      setNom(''); setVille(''); setBudget(''); setDesc('');
      await load();
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setSaving(false); }
  };

  const del = (id, name) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await API.deleteProject(id); await load(); }
        catch (e) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  const updatePct = async (id, current) => {
    Alert.prompt('Avancement', 'Pourcentage (0-100)', async (val) => {
      const pct = Math.min(100, Math.max(0, parseInt(val)||0));
      try { await API.updatePct(id, pct); await load(); }
      catch (e) { Alert.alert('Erreur', e.message); }
    }, 'plain-text', String(current));
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}>

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
                <TouchableOpacity style={styles.pctBtn} onPress={() => updatePct(p.id, p.pct)}>
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

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nouveau projet</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.label}>Nom du projet *</Text>
            <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Villa Ait Melloul, Casablanca…" />
            <Text style={styles.label}>Ville</Text>
            <TextInput style={styles.input} value={ville} onChangeText={setVille} placeholder="Casablanca" />
            <Text style={styles.label}>Budget (DH)</Text>
            <TextInput style={styles.input} value={budget} onChangeText={setBudget} placeholder="0" keyboardType="numeric" />
            <Text style={styles.label}>Type</Text>
            {TYPES.map(t => (
              <TouchableOpacity key={t} style={[styles.typeOption, type === t && styles.typeSelected]}
                onPress={() => setType(t)}>
                <Text style={[styles.typeOptionTxt, type === t && { color: Colors.gold, fontWeight: '600' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={desc} onChangeText={setDesc} placeholder="Détails du projet…" multiline />
            <TouchableOpacity style={styles.saveBtn} onPress={create} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.navy} /> :
                <Text style={styles.saveBtnTxt}>Créer le projet</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 40 },
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
  pctBtn: { alignItems: 'center', padding: 8, backgroundColor: 'rgba(232,184,75,0.12)', borderRadius: Radius.md },
  pctTxt: { fontSize: 16, fontWeight: '700', color: Colors.gold },
  pctEdit: { fontSize: 10, marginTop: 2 },
  progressBg: { height: 5, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 5, backgroundColor: Colors.gold, borderRadius: 3 },
  projDesc: { fontSize: 12, color: Colors.muted, lineHeight: 18 },
  projActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  projDate: { fontSize: 11, color: Colors.muted },
  delBtn: { fontSize: 12, color: Colors.red, fontWeight: '600' },

  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  modalClose: { fontSize: 20, color: Colors.muted, padding: 4 },
  modalScroll: { padding: Spacing.md, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, fontSize: 14, color: Colors.ink, borderWidth: 0.5, borderColor: Colors.border },
  typeOption: { padding: 11, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.white },
  typeSelected: { borderColor: Colors.gold, backgroundColor: 'rgba(232,184,75,0.08)' },
  typeOptionTxt: { fontSize: 13, color: Colors.ink },
  saveBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
});
