import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { API } from '../api';
import Card from '../components/Card';
import Logo from '../components/Logo';
import { Colors, Spacing, Radius } from '../theme';

function KPI({ label, value, note, color }) {
  return (
    <View style={[styles.kpi, color && { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {note ? <Text style={styles.kpiNote}>{note}</Text> : null}
    </View>
  );
}

function ActivityItem({ msg, date }) {
  return (
    <View style={styles.actRow}>
      <View style={styles.actDot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.actMsg}>{msg}</Text>
        <Text style={styles.actDate}>{date ? new Date(date).toLocaleDateString('fr-FR') : ''}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [data, setData] = useState({ projects: [], expenses: [], photos: [], activities: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projs, exps, phts, acts, st] = await Promise.all([
        API.getProjects(), API.getExpenses(), API.getPhotos(),
        API.getActivities(), API.getPlatformStats(),
      ]);
      setData({ projects: projs, expenses: exps, photos: phts, activities: acts });
      setStats(st);
    } catch (e) {
      console.warn(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const totalBudget = data.projects.reduce((s, p) => s + (p.budget || 0), 0);
  const totalDep    = data.expenses.filter(e => !e.deleted).reduce((s, e) => s + (e.montant || 0), 0);
  const activeProjs = data.projects.length;
  const avgPct      = activeProjs ? Math.round(data.projects.reduce((s,p) => s + (p.pct||0), 0) / activeProjs) : 0;

  if (loading) return (
    <View style={styles.loadCenter}>
      <ActivityIndicator color={Colors.gold} size="large" />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greet}>Bonjour, {user?.prenom} 👋</Text>
            <Text style={styles.sub}>Voici l'état de vos projets</Text>
          </View>
          <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>🚪</Text>
          </TouchableOpacity>
        </View>

        {/* Platform stats banner */}
        {stats && (
          <Card style={styles.statsBanner}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}><Text style={styles.statVal}>{stats.pros}+</Text><Text style={styles.statLbl}>Pros vérifiés</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text style={styles.statVal}>{stats.cities}</Text><Text style={styles.statLbl}>Villes</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text style={styles.statVal}>{stats.projects}+</Text><Text style={styles.statLbl}>Projets</Text></View>
            </View>
          </Card>
        )}

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <KPI label="PROJETS" value={activeProjs} note={`${avgPct}% moy.`} color={Colors.gold} />
          <KPI label="BUDGET" value={totalBudget ? (totalBudget/1000).toFixed(0)+'k DH' : '—'} color={Colors.blue} />
          <KPI label="DÉPENSES" value={totalDep ? (totalDep/1000).toFixed(0)+'k DH' : '0 DH'} color={Colors.teal} />
          <KPI label="PHOTOS" value={data.photos.length} color={Colors.amber} />
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.gold }]}
            onPress={() => navigation.navigate('Projects', { openAdd: true })}>
            <Text style={styles.actionBtnTxt}>+ Nouveau projet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'white', borderWidth: 0.5, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('Pros')}>
            <Text style={[styles.actionBtnTxt, { color: Colors.ink }]}>Trouver un pro</Text>
          </TouchableOpacity>
        </View>

        {/* Recent projects */}
        {data.projects.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏗️ Mes projets</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
                <Text style={styles.seeAll}>Voir tout →</Text>
              </TouchableOpacity>
            </View>
            {data.projects.slice(0, 3).map(p => (
              <Card key={p.id}>
                <View style={styles.projRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projName}>{p.nom}</Text>
                    <Text style={styles.projVille}>📍 {p.ville || 'Non précisée'} · {p.type}</Text>
                  </View>
                  <View style={styles.pctBadge}>
                    <Text style={styles.pctTxt}>{p.pct}%</Text>
                  </View>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${p.pct}%` }]} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Recent activity */}
        {data.activities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚡ Activité récente</Text>
            <Card>
              {data.activities.slice(0, 5).map((a, i) => (
                <ActivityItem key={i} msg={a.msg} date={a.created_at} />
              ))}
            </Card>
          </View>
        )}

        {/* Empty state */}
        {data.projects.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏠</Text>
            <Text style={styles.emptyTitle}>Commencez votre premier projet</Text>
            <Text style={styles.emptySub}>Créez un projet pour suivre votre chantier, gérer votre budget et trouver des professionnels.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('Projects', { openAdd: true })}>
              <Text style={styles.emptyBtnTxt}>+ Créer un projet</Text>
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 40 },
  loadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, paddingHorizontal: 4 },
  greet: { fontSize: 20, fontWeight: '700', color: Colors.ink },
  sub: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutTxt: { fontSize: 20 },

  statsBanner: { backgroundColor: Colors.navy, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '700', color: Colors.gold, fontFamily: 'serif' },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 0.5, height: 30, backgroundColor: 'rgba(255,255,255,0.15)' },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  kpi: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 10, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center' },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  kpiValue: { fontSize: 18, fontWeight: '700', color: Colors.ink, marginTop: 4 },
  kpiNote: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  actionBtn: { flex: 1, borderRadius: Radius.full, paddingVertical: 11, alignItems: 'center' },
  actionBtnTxt: { fontWeight: '600', fontSize: 13, color: Colors.navy },

  section: { marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  seeAll: { fontSize: 12, color: Colors.gold, fontWeight: '600' },

  projRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  projName: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  projVille: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  pctBadge: { backgroundColor: Colors.goldLight, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  pctTxt: { fontSize: 12, fontWeight: '700', color: Colors.gold },
  progressBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.gold, borderRadius: 2 },

  actRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  actDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gold, marginTop: 6 },
  actMsg: { fontSize: 13, color: Colors.ink },
  actDate: { fontSize: 11, color: Colors.muted, marginTop: 2 },

  emptyCard: { alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, paddingVertical: 12, paddingHorizontal: 28 },
  emptyBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 14 },
});
