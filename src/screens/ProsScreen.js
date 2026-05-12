import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Linking, ActivityIndicator, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import Card from '../components/Card';
import { Colors, Spacing, Radius } from '../theme';

const VILLES = ['', 'Casablanca','Rabat','Marrakech','Tanger','Agadir','Fes','Meknes','Kenitra','Oujda'];
const ROLES  = ['', 'entrepreneur','architecte','electricien','plombier','carreleur','peintre','menuisier'];

function Stars({ note }) {
  const full = Math.round(note);
  return (
    <Text style={{ fontSize: 12, color: Colors.gold }}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)} {note}/5
    </Text>
  );
}

export default function ProsScreen() {
  const [pros, setPros]        = useState([]);
  const [loading, setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]    = useState('');
  const [ville, setVille]      = useState('');
  const [role, setRole]        = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await API.getPros({ ville: ville || undefined, role: role || undefined });
      setPros(p);
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [ville, role]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = pros.filter(p =>
    !search || p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const callPro = (tel) => Linking.openURL('tel:' + tel.replace(/\s/g, ''));
  const whatsapp = (tel) => Linking.openURL('https://wa.me/' + tel.replace(/\D/g, ''));

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}>

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>🔍 Trouver un pro</Text>
          <Text style={styles.pageSub}>{filtered.length} professionnel{filtered.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch}
            placeholder="Rechercher par nom, spécialité…" placeholderTextColor={Colors.muted} />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Text style={styles.clearBtn}>✕</Text></TouchableOpacity> : null}
        </View>

        {/* Filter toggles */}
        <View style={styles.filterRow}>
          {VILLES.slice(1, 6).map(v => (
            <TouchableOpacity key={v} style={[styles.filterChip, ville === v && styles.filterChipActive]}
              onPress={() => setVille(ville === v ? '' : v)}>
              <Text style={[styles.filterChipTxt, ville === v && styles.filterChipTxtActive]}>{v}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.filterChip, showFilters && styles.filterChipActive]}
            onPress={() => setShowFilters(!showFilters)}>
            <Text style={[styles.filterChipTxt, showFilters && styles.filterChipTxtActive]}>⚙ Filtres</Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersExpanded}>
            <Text style={styles.filterLabel}>Ville</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {VILLES.map(v => (
                <TouchableOpacity key={v || 'all'} style={[styles.filterChip, ville === v && styles.filterChipActive, { marginRight: 6 }]}
                  onPress={() => setVille(v)}>
                  <Text style={[styles.filterChipTxt, ville === v && styles.filterChipTxtActive]}>{v || 'Toutes'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.filterLabel}>Spécialité</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ROLES.map(r => (
                <TouchableOpacity key={r || 'all'} style={[styles.filterChip, role === r && styles.filterChipActive, { marginRight: 6 }]}
                  onPress={() => setRole(r)}>
                  <Text style={[styles.filterChipTxt, role === r && styles.filterChipTxtActive]}>{r || 'Tous'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Pro cards */}
        {filtered.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyTxt}>Aucun professionnel trouvé dans cette zone.</Text>
            <Text style={styles.emptySub}>Essayez une autre ville ou catégorie.</Text>
          </Card>
        ) : (
          filtered.map(p => (
            <Card key={p.id}>
              <View style={styles.proRow}>
                <View style={styles.proEmoji}>
                  <Text style={styles.proEmojiTxt}>{p.emoji || '🔧'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.proNameRow}>
                    <Text style={styles.proName}>{p.nom}</Text>
                    {p.verified ? <Text style={styles.verifiedBadge}>✓</Text> : null}
                  </View>
                  <Text style={styles.proRole}>{p.role}</Text>
                  <Text style={styles.proVille}>📍 {p.ville}</Text>
                  <Stars note={p.note} />
                  {p.description ? <Text style={styles.proDesc} numberOfLines={2}>{p.description}</Text> : null}
                </View>
              </View>
              {p.tel && (
                <View style={styles.proActions}>
                  <TouchableOpacity style={styles.callBtn} onPress={() => callPro(p.tel)}>
                    <Text style={styles.callBtnTxt}>📞 Appeler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.waBtn} onPress={() => whatsapp(p.tel)}>
                    <Text style={styles.waBtnTxt}>💬 WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 40 },
  pageHeader: { marginBottom: Spacing.md },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.ink },
  pageSub: { fontSize: 12, color: Colors.muted, marginTop: 2 },

  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 0.5, borderColor: Colors.border, marginBottom: 10 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.ink },
  clearBtn: { fontSize: 16, color: Colors.muted, padding: 4 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.white },
  filterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterChipTxt: { fontSize: 12, color: Colors.ink },
  filterChipTxtActive: { color: Colors.navy, fontWeight: '700' },
  filtersExpanded: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10, borderWidth: 0.5, borderColor: Colors.border },
  filterLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  proRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  proEmoji: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: 'rgba(232,184,75,0.12)', alignItems: 'center', justifyContent: 'center' },
  proEmojiTxt: { fontSize: 22 },
  proNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proName: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  verifiedBadge: { fontSize: 11, color: Colors.teal, fontWeight: '700', backgroundColor: Colors.greenBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  proRole: { fontSize: 12, color: Colors.muted, textTransform: 'capitalize', marginTop: 2 },
  proVille: { fontSize: 12, color: Colors.blue, marginTop: 2 },
  proDesc: { fontSize: 12, color: Colors.muted, marginTop: 4, lineHeight: 17 },
  proActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  callBtn: { flex: 1, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.white },
  callBtnTxt: { fontSize: 12, fontWeight: '600', color: Colors.ink },
  waBtn: { flex: 1, paddingVertical: 9, borderRadius: Radius.full, backgroundColor: '#25D366', alignItems: 'center' },
  waBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.white },

  empty: { alignItems: 'center', padding: 32 },
  emptyTxt: { fontSize: 14, fontWeight: '600', color: Colors.ink, textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 12, color: Colors.muted, textAlign: 'center' },
});
