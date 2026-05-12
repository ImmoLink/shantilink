import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, Alert, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import Card from '../components/Card';
import { Colors, Spacing, Radius } from '../theme';

const CATS = ['Matériaux','Main d\'œuvre','Équipement','Transport','Honoraires','Autre'];

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [desc, setDesc] = useState('');
  const [montant, setMontant] = useState('');
  const [cat, setCat] = useState(CATS[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const load = useCallback(async () => {
    try {
      const e = await API.getExpenses();
      setExpenses(e.filter(x => !x.deleted));
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const total = expenses.reduce((s, e) => s + (e.montant || 0), 0);

  const byCat = CATS.map(c => ({
    name: c,
    total: expenses.filter(e => e.categorie === c).reduce((s, e) => s + e.montant, 0),
    count: expenses.filter(e => e.categorie === c).length,
  })).filter(c => c.count > 0);

  const create = async () => {
    if (!desc.trim() || !montant) { Alert.alert('Requis', 'Description et montant requis'); return; }
    setSaving(true);
    try {
      await API.createExpense({ description: desc, montant: parseFloat(montant), categorie: cat, date });
      setShowAdd(false);
      setDesc(''); setMontant('');
      await load();
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setSaving(false); }
  };

  const del = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette dépense ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await API.deleteExpense(id); await load(); }
        catch (e) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>💰 Budget & Dépenses</Text>
            <Text style={styles.pageSub}>{expenses.length} dépense{expenses.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
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
                <Text style={styles.catPct}>{total ? Math.round(c.total/total*100) : 0}%</Text>
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
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.emptyBtnTxt}>+ Ajouter une dépense</Text>
              </TouchableOpacity>
            </Card>
          ) : (
            expenses.map(e => (
              <Card key={e.id} style={styles.expCard}>
                <View style={styles.expRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expDesc}>{e.description}</Text>
                    <View style={styles.expMeta}>
                      <Text style={styles.expCat}>{e.categorie}</Text>
                      {e.date ? <Text style={styles.expDate}>{new Date(e.date).toLocaleDateString('fr-FR')}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.expRight}>
                    <Text style={styles.expMontant}>{e.montant.toLocaleString('fr-FR')} DH</Text>
                    <TouchableOpacity onPress={() => del(e.id)}>
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
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.label}>Description *</Text>
            <TextInput style={styles.input} value={desc} onChangeText={setDesc} placeholder="Achat ciment, carrelage…" />
            <Text style={styles.label}>Montant (DH) *</Text>
            <TextInput style={styles.input} value={montant} onChangeText={setMontant} placeholder="0" keyboardType="numeric" />
            <Text style={styles.label}>Catégorie</Text>
            <View style={styles.catBtns}>
              {CATS.map(c => (
                <TouchableOpacity key={c} style={[styles.catBtn, cat === c && styles.catBtnActive]} onPress={() => setCat(c)}>
                  <Text style={[styles.catBtnTxt, cat === c && styles.catBtnTxtActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Date</Text>
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2025-01-01" />
            <TouchableOpacity style={styles.saveBtn} onPress={create} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.navy} /> :
                <Text style={styles.saveBtnTxt}>Enregistrer</Text>}
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

  totalCard: { backgroundColor: Colors.navy, alignItems: 'center', paddingVertical: 24, marginBottom: Spacing.md },
  totalLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' },
  totalValue: { fontSize: 32, fontWeight: '700', color: Colors.gold, fontFamily: 'serif', marginVertical: 4 },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },

  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border, gap: 8 },
  catName: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  catCount: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  catTotal: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  catPct: { fontSize: 11, color: Colors.muted, width: 34, textAlign: 'right' },

  expCard: { marginBottom: 6 },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expDesc: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  expMeta: { flexDirection: 'row', gap: 8, marginTop: 3 },
  expCat: { fontSize: 10, color: Colors.gold, fontWeight: '700', backgroundColor: 'rgba(232,184,75,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  expDate: { fontSize: 11, color: Colors.muted },
  expRight: { alignItems: 'flex-end', gap: 4 },
  expMontant: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  expDel: { fontSize: 14, color: Colors.red, fontWeight: '700' },

  empty: { alignItems: 'center', padding: 24 },
  emptyTxt: { fontSize: 13, color: Colors.muted, marginBottom: 12 },
  emptyBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, paddingVertical: 9, paddingHorizontal: 20 },
  emptyBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 13 },

  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  modalClose: { fontSize: 20, color: Colors.muted, padding: 4 },
  modalScroll: { padding: Spacing.md, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, fontSize: 14, color: Colors.ink, borderWidth: 0.5, borderColor: Colors.border },
  catBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  catBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  catBtnTxt: { fontSize: 12, color: Colors.ink, fontWeight: '500' },
  catBtnTxtActive: { color: Colors.navy, fontWeight: '700' },
  saveBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
});
