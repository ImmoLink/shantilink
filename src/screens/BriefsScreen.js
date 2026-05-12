import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, Alert, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import { Colors, Spacing, Radius } from '../theme';

const CATS = ['entrepreneur','architecte','electricien','plombier','carreleur','peintre','menuisier'];

export default function BriefsScreen() {
  const { user } = useAuth();
  const isPro = user && user.role !== 'client';

  const [tab, setTab] = useState(isPro ? 'available' : 'mine');
  const [briefs, setBriefs] = useState([]);
  const [myBriefs, setMyBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [respondModal, setRespondModal] = useState(null); // {id, titre}
  const [saving, setSaving] = useState(false);

  // Add brief form
  const [titre, setTitre] = useState('');
  const [desc, setDesc] = useState('');
  const [briefVille, setBriefVille] = useState('');
  const [briefCat, setBriefCat] = useState(CATS[0]);
  const [budMin, setBudMin] = useState('');
  const [budMax, setBudMax] = useState('');

  // Respond form
  const [respMsg, setRespMsg] = useState('');
  const [respPrix, setRespPrix] = useState('');
  const [respDelai, setRespDelai] = useState('');

  const load = useCallback(async () => {
    try {
      const [all, mine] = await Promise.all([API.getBriefs(), API.getMyBriefs()]);
      setBriefs(all);
      setMyBriefs(mine);
    } catch (e) { console.warn(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const createBrief = async () => {
    if (!titre.trim()) { Alert.alert('Requis', 'Le titre est requis'); return; }
    setSaving(true);
    try {
      await API.createBrief({ titre, description: desc, ville: briefVille, categorie: briefCat, budget_min: parseInt(budMin)||0, budget_max: parseInt(budMax)||0 });
      setShowAdd(false);
      setTitre(''); setDesc(''); setBriefVille(''); setBudMin(''); setBudMax('');
      await load();
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setSaving(false); }
  };

  const submitResponse = async () => {
    if (!respMsg.trim()) { Alert.alert('Requis', 'Votre message est requis'); return; }
    setSaving(true);
    try {
      await API.respondBrief(respondModal.id, { message: respMsg, prix: parseInt(respPrix)||0, delai: respDelai });
      Alert.alert('Envoyé', 'Votre offre a été envoyée avec succès.');
      setRespondModal(null);
      setRespMsg(''); setRespPrix(''); setRespDelai('');
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setSaving(false); }
  };

  const delBrief = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette demande ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await API.deleteBrief(id); await load(); }
        catch (e) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;

  const current = tab === 'mine' ? myBriefs : briefs;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}>

        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>📝 Demandes de devis</Text>
            <Text style={styles.pageSub}>{isPro ? 'Trouvez des projets, envoyez vos offres' : 'Publiez votre projet, recevez des offres'}</Text>
          </View>
          {!isPro && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.addBtnTxt}>+ Publier</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'mine' && styles.tabActive]} onPress={() => setTab('mine')}>
            <Text style={[styles.tabTxt, tab === 'mine' && styles.tabTxtActive]}>Mes demandes ({myBriefs.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'available' && styles.tabActive]} onPress={() => setTab('available')}>
            <Text style={[styles.tabTxt, tab === 'available' && styles.tabTxtActive]}>Disponibles ({briefs.length})</Text>
          </TouchableOpacity>
        </View>

        {current.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyEmoji}>{tab === 'mine' ? '📋' : '🔍'}</Text>
            <Text style={styles.emptyTxt}>{tab === 'mine' ? 'Aucune demande publiée.' : 'Aucune demande disponible.'}</Text>
            {tab === 'mine' && !isPro && (
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.emptyBtnTxt}>+ Publier une demande</Text>
              </TouchableOpacity>
            )}
          </Card>
        ) : (
          current.map(b => (
            <Card key={b.id}>
              <View style={styles.briefHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.briefTitre}>{b.titre}</Text>
                  <Text style={styles.briefMeta}>📍 {b.ville || 'N/A'} · 🔧 {b.categorie}</Text>
                  {(b.budget_max || 0) > 0 && (
                    <Text style={styles.briefBudget}>{(b.budget_min||0).toLocaleString('fr-FR')} – {b.budget_max.toLocaleString('fr-FR')} DH</Text>
                  )}
                </View>
                <View style={styles.briefRight}>
                  <View style={[styles.statusBadge, b.status === 'open' ? styles.statusOpen : styles.statusClosed]}>
                    <Text style={[styles.statusTxt, b.status === 'open' ? { color: Colors.green } : { color: Colors.muted }]}>
                      {b.status === 'open' ? 'Ouvert' : 'Clôturé'}
                    </Text>
                  </View>
                </View>
              </View>

              {b.description ? <Text style={styles.briefDesc} numberOfLines={2}>{b.description}</Text> : null}

              {/* Responses (for own briefs) */}
              {tab === 'mine' && (b.responses || []).length > 0 && (
                <View style={styles.responsesSection}>
                  <Text style={styles.responsesTitle}>{b.responses.length} réponse{b.responses.length !== 1 ? 's' : ''}</Text>
                  {b.responses.map(r => (
                    <View key={r.id} style={styles.responseCard}>
                      <View style={styles.responseHeader}>
                        <Text style={styles.responseName}>{r.prenom} {r.nom}</Text>
                        {r.prix > 0 && <Text style={styles.responsePrix}>{r.prix.toLocaleString('fr-FR')} DH</Text>}
                      </View>
                      <Text style={styles.responseMsg} numberOfLines={3}>{r.message}</Text>
                      {r.delai ? <Text style={styles.responseDelai}>⏱ {r.delai}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.briefActions}>
                {tab === 'available' && isPro ? (
                  <TouchableOpacity style={styles.repondreBtn} onPress={() => setRespondModal({ id: b.id, titre: b.titre })}>
                    <Text style={styles.reponderBtnTxt}>Répondre →</Text>
                  </TouchableOpacity>
                ) : tab === 'mine' ? (
                  <TouchableOpacity onPress={() => delBrief(b.id)}>
                    <Text style={styles.delTxt}>Supprimer</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.briefDate}>{new Date(b.created_at).toLocaleDateString('fr-FR')}</Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nouvelle demande</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.label}>Titre *</Text>
            <TextInput style={styles.input} value={titre} onChangeText={setTitre} placeholder="Ex: Construction villa R+1 à Casablanca" />
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} placeholder="Décrivez votre projet en détail…" multiline />
            <Text style={styles.label}>Ville</Text>
            <TextInput style={styles.input} value={briefVille} onChangeText={setBriefVille} placeholder="Casablanca" />
            <Text style={styles.label}>Catégorie de professionnel</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {CATS.map(c => (
                <TouchableOpacity key={c} style={[styles.filterChip, briefCat === c && styles.filterChipActive, { marginRight: 6 }]}
                  onPress={() => setBriefCat(c)}>
                  <Text style={[styles.filterChipTxt, briefCat === c && styles.filterChipTxtActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Budget min (DH)</Text>
                <TextInput style={styles.input} value={budMin} onChangeText={setBudMin} placeholder="0" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Budget max (DH)</Text>
                <TextInput style={styles.input} value={budMax} onChangeText={setBudMax} placeholder="0" keyboardType="numeric" />
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={createBrief} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.navy} /> : <Text style={styles.saveBtnTxt}>Publier la demande</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Respond modal */}
      <Modal visible={!!respondModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Envoyer une offre</Text>
            <TouchableOpacity onPress={() => setRespondModal(null)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {respondModal && <View style={styles.briefTitleBox}><Text style={styles.briefTitleBoxTxt}>{respondModal.titre}</Text></View>}
            <Text style={styles.label}>Votre message *</Text>
            <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={respMsg} onChangeText={setRespMsg} placeholder="Présentez votre approche, vos références…" multiline />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Prix proposé (DH)</Text>
                <TextInput style={styles.input} value={respPrix} onChangeText={setRespPrix} placeholder="0" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Délai estimé</Text>
                <TextInput style={styles.input} value={respDelai} onChangeText={setRespDelai} placeholder="3 mois" />
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={submitResponse} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.navy} /> : <Text style={styles.saveBtnTxt}>Envoyer l'offre</Text>}
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

  tabs: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.full, padding: 4, marginBottom: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: Radius.full, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.gold },
  tabTxt: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  tabTxtActive: { color: Colors.navy },

  briefHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  briefTitre: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  briefMeta: { fontSize: 11, color: Colors.muted, marginTop: 3 },
  briefBudget: { fontSize: 12, color: Colors.gold, fontWeight: '600', marginTop: 3 },
  briefRight: { alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  statusOpen: { backgroundColor: Colors.greenBg },
  statusClosed: { backgroundColor: Colors.bg },
  statusTxt: { fontSize: 10, fontWeight: '700' },
  briefDesc: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginBottom: 6 },
  briefActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: Colors.border },
  repondreBtn: { backgroundColor: Colors.gold, paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.full },
  reponderBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 12 },
  delTxt: { fontSize: 12, color: Colors.red, fontWeight: '600' },
  briefDate: { fontSize: 11, color: Colors.muted },

  responsesSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: Colors.border },
  responsesTitle: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', marginBottom: 6 },
  responseCard: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: 10, marginBottom: 6 },
  responseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  responseName: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  responsePrix: { fontSize: 13, fontWeight: '700', color: Colors.gold },
  responseMsg: { fontSize: 12, color: Colors.ink, lineHeight: 18 },
  responseDelai: { fontSize: 11, color: Colors.muted, marginTop: 4 },

  empty: { alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTxt: { fontSize: 14, color: Colors.muted, marginBottom: 16, textAlign: 'center' },
  emptyBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, paddingVertical: 10, paddingHorizontal: 24 },
  emptyBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 13 },

  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  modalClose: { fontSize: 20, color: Colors.muted, padding: 4 },
  modalScroll: { padding: Spacing.md, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, fontSize: 14, color: Colors.ink, borderWidth: 0.5, borderColor: Colors.border },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  filterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterChipTxt: { fontSize: 12, color: Colors.ink },
  filterChipTxtActive: { color: Colors.navy, fontWeight: '700' },
  saveBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
  briefTitleBox: { backgroundColor: Colors.sandLight, borderRadius: Radius.md, padding: 10, marginTop: 4 },
  briefTitleBoxTxt: { fontSize: 13, color: Colors.ink, fontStyle: 'italic' },
});
