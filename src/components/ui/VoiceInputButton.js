import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  StyleSheet, Animated, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractFromTranscription, startRecording, stopRecording } from '../../services/voiceInput';
import { mapCategorieToUI } from '../../services/imageAnalysis';
import { Colors, Spacing, Radius, Shadow } from '../../theme';

/**
 * Bouton micro flottant — états : idle → recording → processing → done
 *
 * Props:
 *   onResult  — (data) => void, même structure que PhotoCaptureButton
 *   style     — style override
 */
export default function VoiceInputButton({ onResult, style }) {
  const [status, setStatus] = useState('idle'); // idle | recording | processing | done
  const [showModal, setShowModal] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [liveText, setLiveText] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef(null);
  const silenceTimer = useRef(null);

  // Pulse animation while recording
  useEffect(() => {
    if (status === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [status]);

  const handleStart = useCallback(async () => {
    setTranscription('');
    setLiveText('');
    setShowModal(true);

    const rec = await startRecording();
    if (!rec) {
      // expo-av not available → show manual input mode
      setStatus('manual');
      return;
    }
    recordingRef.current = rec;
    setStatus('recording');
  }, []);

  const handleStop = useCallback(async () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (status !== 'recording' || !recordingRef.current) return;
    setStatus('processing');

    const uri = await stopRecording(recordingRef.current);
    recordingRef.current = null;

    if (!uri) {
      setStatus('idle');
      setShowModal(false);
      Alert.alert('Erreur', 'Enregistrement échoué. Réessaie.');
      return;
    }

    // For now, show manual input since Whisper transcription requires
    // an additional API call and key. URI is captured and ready.
    setStatus('manual');
    Alert.alert(
      'Transcription',
      'La reconnaissance vocale automatique nécessite la config Whisper. '
      + 'Écris ce que tu voulais dire :',
      [{ text: 'OK' }]
    );
  }, [status]);

  const handleManualSubmit = useCallback(async () => {
    if (!transcription.trim()) return;
    setStatus('processing');

    try {
      const result = await extractFromTranscription(transcription);
      if (result) {
        if (result.categorie) result.categorie = mapCategorieToUI(result.categorie);
        onResult(result);
        setStatus('done');
        setTimeout(() => {
          setStatus('idle');
          setShowModal(false);
          setTranscription('');
        }, 1200);
      } else {
        setStatus('manual');
        Alert.alert('Non compris', 'Essaie de reformuler la dépense plus clairement.');
      }
    } catch (_) {
      setStatus('manual');
      Alert.alert(
        'Pas de connexion',
        'Ta saisie est mémorisée — connecte-toi pour l\'analyser.'
      );
    }
  }, [transcription, onResult]);

  const dismiss = useCallback(() => {
    if (recordingRef.current) stopRecording(recordingRef.current).catch(() => {});
    recordingRef.current = null;
    setStatus('idle');
    setShowModal(false);
    setTranscription('');
  }, []);

  const isRecording = status === 'recording';
  const isManual = status === 'manual';
  const isProcessing = status === 'processing';

  return (
    <>
      {/* Floating mic button */}
      <TouchableOpacity
        style={[styles.fab, style]}
        onPress={() => (isRecording ? handleStop() : handleStart())}
        accessibilityLabel="Saisie vocale"
        accessibilityRole="button"
      >
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Text style={styles.fabIcon}>{isRecording ? '⏹️' : '🎙️'}</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Recording / manual modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />

            <Text style={styles.title}>
              {isRecording   ? '🔴 Enregistrement…' :
               isProcessing  ? '⏳ Analyse…' :
               status === 'done' ? '✅ Compris !' :
               '🎙️ Saisie vocale'}
            </Text>

            {isRecording && (
              <Text style={styles.hint}>
                Parle en français ou en darija.{'\n'}
                Ex : "mille cinq cents dirhams de ciment chez BricoPrix"
              </Text>
            )}

            {(isManual || status === 'idle') && (
              <>
                <Text style={styles.label}>Tape ou dicte ce que tu veux enregistrer :</Text>
                <TextInput
                  style={styles.textInput}
                  value={transcription}
                  onChangeText={setTranscription}
                  placeholder="Ex: 2500 DH de fer à béton chez Sonasid"
                  multiline
                  numberOfLines={3}
                  autoFocus
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.analyzeBtn, !transcription.trim() && styles.analyzeBtnDisabled]}
                  onPress={handleManualSubmit}
                  disabled={!transcription.trim()}
                >
                  <Text style={styles.analyzeBtnTxt}>Analyser →</Text>
                </TouchableOpacity>
              </>
            )}

            {isRecording && (
              <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
                <Text style={styles.stopBtnTxt}>Arrêter l'enregistrement</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={dismiss}>
              <Text style={styles.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  fabIcon: { fontSize: 22 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
  hint: { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  textInput: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.sm,
    fontSize: 14,
    color: Colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  analyzeBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    padding: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  analyzeBtnDisabled: { opacity: 0.4 },
  analyzeBtnTxt: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  stopBtn: {
    backgroundColor: Colors.redBg,
    borderRadius: Radius.full,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,31,31,0.2)',
    minHeight: 48,
  },
  stopBtnTxt: { fontSize: 14, fontWeight: '600', color: Colors.red },
  cancelBtn: { alignItems: 'center', padding: Spacing.sm, minHeight: 44 },
  cancelTxt: { fontSize: 14, color: Colors.muted },
});
