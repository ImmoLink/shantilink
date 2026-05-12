import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { Colors, Spacing, Radius } from '../theme';

const ROLES = [
  { value: 'client',      label: 'Maître d\'ouvrage / Client' },
  { value: 'entrepreneur',label: 'Entrepreneur BTP' },
  { value: 'architecte',  label: 'Architecte' },
  { value: 'electricien', label: 'Électricien' },
  { value: 'plombier',    label: 'Plombier' },
  { value: 'autre',       label: 'Autre professionnel BTP' },
];

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [lEmail, setLEmail] = useState('');
  const [lPwd,   setLPwd]   = useState('');

  // Register fields
  const [rPrenom, setRPrenom] = useState('');
  const [rNom,    setRNom]    = useState('');
  const [rEmail,  setREmail]  = useState('');
  const [rPwd,    setRPwd]    = useState('');
  const [rVille,  setRVille]  = useState('');
  const [rRole,   setRRole]   = useState('client');
  const [showRoles, setShowRoles] = useState(false);

  const doLogin = async () => {
    if (!lEmail || !lPwd) { Alert.alert('Champs requis', 'Entrez votre email et mot de passe'); return; }
    setLoading(true);
    try {
      const res = await API.login({ email: lEmail, password: lPwd });
      await signIn(res.user, res.token);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally { setLoading(false); }
  };

  const doRegister = async () => {
    if (!rPrenom || !rEmail || rPwd.length < 6) {
      Alert.alert('Champs requis', 'Remplissez tous les champs (mot de passe min. 6 caractères)');
      return;
    }
    setLoading(true);
    try {
      const res = await API.register({ prenom: rPrenom, nom: rNom, email: rEmail, password: rPwd, role: rRole, ville: rVille });
      await signIn(res.user, res.token);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Logo size={40} textSize={22} />
            <Text style={styles.tagline}>Pilotez votre chantier avec confiance</Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, tab === 'login' && styles.tabActive]} onPress={() => setTab('login')}>
              <Text style={[styles.tabTxt, tab === 'login' && styles.tabTxtActive]}>Connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'register' && styles.tabActive]} onPress={() => setTab('register')}>
              <Text style={[styles.tabTxt, tab === 'register' && styles.tabTxtActive]}>Inscription</Text>
            </TouchableOpacity>
          </View>

          {tab === 'login' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={lEmail} onChangeText={setLEmail}
                placeholder="votre@email.com" keyboardType="email-address" autoCapitalize="none" />
              <Text style={styles.label}>Mot de passe</Text>
              <TextInput style={styles.input} value={lPwd} onChangeText={setLPwd}
                placeholder="••••••••" secureTextEntry />
              <TouchableOpacity style={styles.btn} onPress={doLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> :
                  <Text style={styles.btnTxt}>Se connecter →</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTab('register')} style={styles.switchLink}>
                <Text style={styles.switchTxt}>Pas encore de compte ? <Text style={{ color: Colors.gold }}>S'inscrire</Text></Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Prénom *</Text>
                  <TextInput style={styles.input} value={rPrenom} onChangeText={setRPrenom} placeholder="Mohammed" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Nom</Text>
                  <TextInput style={styles.input} value={rNom} onChangeText={setRNom} placeholder="Alami" />
                </View>
              </View>
              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} value={rEmail} onChangeText={setREmail}
                placeholder="votre@email.com" keyboardType="email-address" autoCapitalize="none" />
              <Text style={styles.label}>Ville</Text>
              <TextInput style={styles.input} value={rVille} onChangeText={setRVille} placeholder="Casablanca" />
              <Text style={styles.label}>Profil</Text>
              <TouchableOpacity style={[styles.input, styles.roleSelector]} onPress={() => setShowRoles(!showRoles)}>
                <Text style={{ color: Colors.ink }}>
                  {ROLES.find(r => r.value === rRole)?.label || 'Sélectionner'}
                </Text>
                <Text style={{ color: Colors.muted }}>▾</Text>
              </TouchableOpacity>
              {showRoles && (
                <View style={styles.roleDropdown}>
                  {ROLES.map(r => (
                    <TouchableOpacity key={r.value} style={styles.roleOption}
                      onPress={() => { setRRole(r.value); setShowRoles(false); }}>
                      <Text style={[styles.roleOptionTxt, rRole === r.value && { color: Colors.gold, fontWeight: '600' }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.label}>Mot de passe *</Text>
              <TextInput style={styles.input} value={rPwd} onChangeText={setRPwd}
                placeholder="Minimum 6 caractères" secureTextEntry />
              <TouchableOpacity style={styles.btn} onPress={doRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> :
                  <Text style={styles.btnTxt}>Créer mon compte →</Text>}
              </TouchableOpacity>
              <Text style={styles.legal}>3 mois d'accès complet offerts à l'inscription.</Text>
              <TouchableOpacity onPress={() => setTab('login')} style={styles.switchLink}>
                <Text style={styles.switchTxt}>Déjà un compte ? <Text style={{ color: Colors.gold }}>Se connecter</Text></Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  scroll: { padding: Spacing.lg, paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: Spacing.xl },
  tagline: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 8, textAlign: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.full, padding: 4, marginBottom: Spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.gold },
  tabTxt: { color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: 14 },
  tabTxtActive: { color: Colors.navy },
  form: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.md, padding: 12, fontSize: 14, color: '#fff', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' },
  row2: { flexDirection: 'row', gap: 10 },
  roleSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleDropdown: { backgroundColor: Colors.navyLight, borderRadius: Radius.md, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', marginTop: 4 },
  roleOption: { padding: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  roleOptionTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  btn: { backgroundColor: Colors.gold, borderRadius: Radius.full, padding: 14, alignItems: 'center', marginTop: 20 },
  btnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
  legal: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginTop: 10 },
  switchLink: { alignItems: 'center', marginTop: 16 },
  switchTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
});
