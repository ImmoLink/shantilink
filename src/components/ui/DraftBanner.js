import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '../../theme';

function formatDraftDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Banner non-intrusif affiché quand useAutoDraft détecte un brouillon existant.
 * Slide-in depuis le haut, deux actions : Reprendre ou Recommencer.
 */
export default function DraftBanner({ hasDraft, lastSavedAt, pendingDraft, onResume, onDiscard }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (hasDraft) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [hasDraft]);

  if (!hasDraft) return null;

  // Build a brief summary of filled fields
  const summary = pendingDraft
    ? Object.entries(pendingDraft)
        .filter(([k, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => {
          if (k === 'montant') return `${v} DH`;
          if (k === 'desc' || k === 'description') return String(v).slice(0, 20);
          if (k === 'cat' || k === 'categorie') return v;
          return null;
        })
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ')
    : '';

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }], opacity }]}>
      <View style={styles.left}>
        <Text style={styles.title}>📝 Brouillon du {formatDraftDate(lastSavedAt)}</Text>
        {summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.resumeBtn} onPress={onResume}>
          <Text style={styles.resumeTxt}>Reprendre</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.discardBtn} onPress={onDiscard}>
          <Text style={styles.discardTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

/** Small bottom-of-screen "Sauvegardé ✓" indicator */
export function SavedIndicator({ visible }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.savedIndicator, { opacity }]} pointerEvents="none">
      <Text style={styles.savedTxt}>✓ Sauvegardé</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.amberBg,
    borderWidth: 1,
    borderColor: 'rgba(139,94,10,0.2)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  left: { flex: 1 },
  title: { fontSize: 12, fontWeight: '600', color: Colors.amber },
  summary: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resumeBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    paddingVertical: 5,
    paddingHorizontal: 12,
    minHeight: 32,
    justifyContent: 'center',
  },
  resumeTxt: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  discardBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  discardTxt: { fontSize: 13, color: Colors.muted },
  savedIndicator: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: Colors.navy,
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedTxt: { fontSize: 12, color: Colors.gold, fontWeight: '600' },
});
