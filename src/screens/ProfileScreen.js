import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Linking, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { API } from '../api';
import Card from '../components/Card';
import { Colors, Spacing, Radius } from '../theme';

const ROLE_LABELS = {
  client: '🏠 Maître d\'ouvrage', entrepreneur: '🏗️ Entrepreneur',
  architecte: '📐 Architecte', electricien: '⚡ Électricien',
  plombier: '🔧 Plombier', autre: '💼 Professionnel BTP',
};

export default function ProfileScreen() {
  const { user, signOut, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [referrals, setReferrals] = useState([]);

  const [prenom, setPrenom] = useState('');
  const [nom, setNom]       = useState('');
  const [ville, setVille]   = useState('');
  const [tel, setTel]       = useState('');
  const [bio, setBio]       = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, r] = await Promise.all([API.getProfile(), API.getReferrals()]);
        setProfile(p);
        setPrenom(p.prenom || ''); setNom(p.nom || '');
        setVille(p.ville || ''); setTel(p.tel || ''); setBio(p.bio || '');
        setReferrals(r);
      } catch (e) { Alert.alert('Erreur', e.message); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await API.updateProfile({ prenom, nom, ville, tel, bio });
      setProfile(updated);
      updateUser({ prenom, nom, ville, tel });
      setEditing(false);
    } catch (e) { Alert.alert('Erreur', e.message); }
    finally { setSaving(false); }
  };

  const shareReferral = async () => {
    const code = profile?.referral_code;
    if (!code) return;
    const url = 'https://shantilink.ma/?ref=' + code;
    try {
      await Share.share({ message: `Rejoins ShantiLink, la plateforme pour gérer ton chantier au Maroc ! ${url}` });
    } catch (e) {}
  };

  const whatsappReferral = () => {
    const code = profile?.referral_code;
    if (!code) return;
    const url = 'https://shantilink.ma/?ref=' + code;
    const msg = encodeURIComponent(`Rejoins ShantiLink ! ${url}`);
    Linking.openURL('https://wa.me/?text=' + msg);
  };

  if (!profile) return <View style={styles.center}><ActivityIndicator color={Colors.gold} size="large" /></View>;

  const completedRefs = referrals.filter(r => r.status === 'completed').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{(profile.prenom || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile.prenom} {profile.nom}</Text>
            <Text style={styles.profileRole}>{ROLE_LABELS[profile.role] || profile.role}</Text>
            {profile.ville ? <Text style={styles.profileVille}>📍 {profile.ville}</Text> : null}
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(!editing)}>
            <Text style={styles.editBtnTxt}>{editing ? 'Annuler' : '✏️ Modifier'}</Text>
          </TouchableOpacity>
        </View>

        {/* Founder badge */}
        {profile.founder_badge && (
          <Card style={styles.founderCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 32 }}>🏅</Text>
              <View>
                <Text style={styles.founderLabel}>MEMBRE FONDATEUR</Text>
                <Text style={styles.founderNum}>#{profile.founder_badge}</Text>
                <Text style={styles.founderSub}>Parmi les 100 premiers membres</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Edit form */}
        {editing ? (
          <Card>
            <Text style={styles.sectionTitle}>Modifier le profil</Text>
            <Text style={styles.label}>Prénom</Text>
            <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} />
            <Text style={styles.label}>Nom</Text>
            <TextInput style={styles.input} value={nom} onChangeText={setNom} />
            <Text style={styles.label}>Ville</Text>
            <TextInput style={styles.input} value={ville} onChangeText={setVille} />
            <Text style={styles.label}>Téléphone</Text>
            <TextInput style={styles.input} value={tel} onChangeText={setTel} keyboardType="phone-pad" />
            <Text style={styles.label}>Bio</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} multiline placeholder="Quelques mots sur vous…" />
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.navy} /> : <Text style={styles.saveBtnTxt}>Enregistrer</Text>}
            </TouchableOpacity>
          </Card>
        ) : (
          <Card>
            <Text style={styles.sectionTitle}>Informations</Text>
            <ProfileRow icon="✉️" label="Email" value={profile.email} />
            {profile.tel ? <ProfileRow icon="📞" label="Téléphone" value={profile.tel} /> : null}
            {profile.ville ? <ProfileRow icon="📍" label="Ville" value={profile.ville} /> : null}
            {profile.bio ? <ProfileRow icon="💬" label="Bio" value={profile.bio} /> : null}
            <ProfileRow icon="📅" label="Membre depuis" value={profile.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—'} />
          </Card>
        )}

        {/* Referral section */}
        <Card>
          <Text style={styles.sectionTitle}>🎁 Parrainage</Text>
          <View style={styles.refStats}>
            <View style={styles.refStatItem}>
              <Text style={styles.refStatVal}>{completedRefs}</Text>
              <Text style={styles.refStatLbl}>Filleuls</Text>
            </View>
            <View style={styles.refStatDivider} />
            <View style={styles.refStatItem}>
              <Text style={styles.refStatVal}>{completedRefs * 250}</Text>
              <Text style={styles.refStatLbl}>DH gagné</Text>
            </View>
            <View style={styles.refStatDivider} />
            <View style={styles.refStatItem}>
              <Text style={styles.refStatVal}>250</Text>
              <Text style={styles.refStatLbl}>DH/filleul</Text>
            </View>
          </View>
          {profile.referral_code && (
            <View style={styles.refCodeBox}>
              <Text style={styles.refCodeLabel}>Votre code</Text>
              <Text style={styles.refCode}>{profile.referral_code}</Text>
            </View>
          )}
          <View style={styles.refActions}>
            <TouchableOpacity style={styles.shareBtn} onPress={shareReferral}>
              <Text style={styles.shareBtnTxt}>Partager le lien</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.waBtn} onPress={whatsappReferral}>
              <Text style={styles.waBtnTxt}>💬 WhatsApp</Text>
            </TouchableOpacity>
          </View>
          {referrals.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.refsTitle}>Mes filleuls</Text>
              {referrals.slice(0, 5).map(r => (
                <View key={r.id} style={styles.refRow}>
                  <Text style={styles.refEmail}>{r.referred_email}</Text>
                  <View style={[styles.refStatus, r.status === 'completed' ? styles.refStatusDone : styles.refStatusPending]}>
                    <Text style={[styles.refStatusTxt, r.status === 'completed' ? { color: Colors.green } : { color: Colors.amber }]}>
                      {r.status === 'completed' ? '✓ Inscrit' : 'En attente'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => {
          Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Déconnecter', style: 'destructive', onPress: signOut },
          ]);
        }}>
          <Text style={styles.logoutTxt}>🚪 Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ icon, label, value }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileRowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.profileRowLabel}>{label}</Text>
        <Text style={styles.profileRowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 40 },

  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: Spacing.md, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 24, fontWeight: '700', color: Colors.navy },
  profileName: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  profileRole: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  profileVille: { fontSize: 12, color: Colors.blue, marginTop: 2 },
  editBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border },
  editBtnTxt: { fontSize: 12, fontWeight: '600', color: Colors.ink },

  founderCard: { backgroundColor: Colors.gold, marginBottom: Spacing.md },
  founderLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: Colors.navy, opacity: 0.7 },
  founderNum: { fontSize: 22, fontWeight: '800', color: Colors.navy },
  founderSub: { fontSize: 11, color: Colors.navy, opacity: 0.8 },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '600', color: Colors.muted, marginBottom: 5, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: 11, fontSize: 14, color: Colors.ink, borderWidth: 0.5, borderColor: Colors.border },
  saveBtn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 13, alignItems: 'center', marginTop: 16 },
  saveBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 14 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  profileRowIcon: { fontSize: 16, width: 24 },
  profileRowLabel: { fontSize: 11, color: Colors.muted },
  profileRowValue: { fontSize: 13, color: Colors.ink, fontWeight: '500', marginTop: 1 },

  refStats: { flexDirection: 'row', backgroundColor: Colors.navy, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 12 },
  refStatItem: { flex: 1, alignItems: 'center' },
  refStatVal: { fontSize: 20, fontWeight: '700', color: Colors.gold },
  refStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2, textTransform: 'uppercase' },
  refStatDivider: { width: 0.5, backgroundColor: 'rgba(255,255,255,0.15)' },
  refCodeBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: 10, marginBottom: 10, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center' },
  refCodeLabel: { fontSize: 11, color: Colors.muted, marginBottom: 4 },
  refCode: { fontSize: 18, fontWeight: '700', color: Colors.ink, letterSpacing: 1.5, fontFamily: 'monospace' },
  refActions: { flexDirection: 'row', gap: 8 },
  shareBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.gold, alignItems: 'center' },
  shareBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.gold },
  waBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: '#25D366', alignItems: 'center' },
  waBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.white },

  refsTitle: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', marginBottom: 6 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  refEmail: { fontSize: 12, color: Colors.ink },
  refStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  refStatusDone: { backgroundColor: Colors.greenBg },
  refStatusPending: { backgroundColor: Colors.amberBg },
  refStatusTxt: { fontSize: 10, fontWeight: '700' },

  logoutBtn: { backgroundColor: Colors.redBg, borderRadius: Radius.lg, padding: 14, alignItems: 'center', marginTop: 8, borderWidth: 0.5, borderColor: 'rgba(139,31,31,0.2)' },
  logoutTxt: { fontSize: 14, fontWeight: '600', color: Colors.red },
});
