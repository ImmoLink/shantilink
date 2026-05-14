import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Shadow } from '../../theme';

// Haptics: optional — app works without expo-haptics installed
let Haptics = null;
try { Haptics = require('expo-haptics'); } catch (_) {}

function triggerHaptic() {
  if (Haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Light ?? 'light').catch(() => {});
  }
}

/**
 * Grille de tuiles 2×N tapables.
 *
 * Props:
 *   tiles        — array de { id, label, sublabel?, icon, value }
 *   selected     — string (single) | string[] (multi)
 *   onSelect     — (value) => void
 *   multiSelect  — bool (défaut false)
 *   columns      — nombre de colonnes (défaut 2)
 *   tileHeight   — hauteur minimale tuile (défaut 80)
 */
export default function QuickTileSelector({
  tiles,
  selected,
  onSelect,
  multiSelect = false,
  columns = 2,
  tileHeight = 80,
}) {
  const isSelected = useCallback(
    (value) => {
      if (multiSelect) return Array.isArray(selected) && selected.includes(value);
      return selected === value;
    },
    [selected, multiSelect]
  );

  const handlePress = useCallback(
    (value) => {
      triggerHaptic();
      if (multiSelect) {
        const prev = Array.isArray(selected) ? selected : [];
        const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
        onSelect(next);
      } else {
        onSelect(value);
      }
    },
    [selected, multiSelect, onSelect]
  );

  const tileWidth = `${Math.floor(100 / columns) - 1}%`;

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => {
        const active = isSelected(tile.value);
        return (
          <TouchableOpacity
            key={tile.id}
            activeOpacity={0.75}
            style={[
              styles.tile,
              { width: tileWidth, minHeight: tileHeight },
              active && styles.tileActive,
            ]}
            onPress={() => handlePress(tile.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tile.label}
          >
            {/* Check badge */}
            {active && (
              <View style={styles.checkBadge}>
                <Text style={styles.checkIcon}>✓</Text>
              </View>
            )}
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>
              {tile.label}
            </Text>
            {tile.sublabel ? (
              <Text style={[styles.tileSub, active && styles.tileSubActive]}>
                {tile.sublabel}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    position: 'relative',
    ...Shadow.sm,
  },
  tileActive: {
    backgroundColor: Colors.goldLight,
    borderColor: Colors.gold,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: { fontSize: 10, color: Colors.navy, fontWeight: '700' },
  tileIcon: { fontSize: 24, marginBottom: 4 },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
    textAlign: 'center',
  },
  tileLabelActive: { color: Colors.navy },
  tileSub: {
    fontSize: 10,
    color: Colors.muted,
    marginTop: 1,
    textAlign: 'center',
  },
  tileSubActive: { color: Colors.amber },
});

// ─── Tile collections réutilisables ─────────────────────────────────────────

export const EXPENSE_CAT_TILES = [
  { id: 'mat',   label: 'Matériaux',     sublabel: 'Mwad',      icon: '🧱', value: 'Matériaux' },
  { id: 'main',  label: "Main d'œuvre",  sublabel: 'Khdama',    icon: '👷', value: "Main d'œuvre" },
  { id: 'tran',  label: 'Transport',     sublabel: 'Transport', icon: '🚚', value: 'Transport' },
  { id: 'equip', label: 'Équipement',    sublabel: 'Moada',     icon: '🔧', value: 'Équipement' },
  { id: 'hon',   label: 'Honoraires',    sublabel: 'Ujra',      icon: '📋', value: 'Honoraires' },
  { id: 'aut',   label: 'Autre',         sublabel: 'Khouji',    icon: '📦', value: 'Autre' },
];

export const WORK_TYPE_TILES = [
  { id: 'mac',  label: 'Maçonnerie',  sublabel: 'Bina',   icon: '🏗️', value: 'Maçonnerie' },
  { id: 'ele',  label: 'Électricité', sublabel: 'Kahrrba', icon: '⚡', value: 'Électricité' },
  { id: 'plo',  label: 'Plomberie',   sublabel: 'Sabak',  icon: '🔩', value: 'Plomberie' },
  { id: 'pei',  label: 'Peinture',    sublabel: 'Lwan',   icon: '🎨', value: 'Peinture' },
  { id: 'men',  label: 'Menuiserie',  sublabel: 'Nijara', icon: '🪵', value: 'Menuiserie' },
  { id: 'car',  label: 'Carrelage',   sublabel: 'Zelij',  icon: '🟦', value: 'Carrelage' },
  { id: 'fer',  label: 'Ferronnerie', sublabel: 'Hdid',   icon: '⚙️', value: 'Ferronnerie' },
  { id: 'toi',  label: 'Toiture',     sublabel: 'Satah',  icon: '🏠', value: 'Toiture' },
];

export const PROGRESS_TILES = [
  { id: 'p0',  label: '0%',   sublabel: 'Bda',      icon: '⬜', value: 0 },
  { id: 'p25', label: '25%',  sublabel: 'Rbaa',     icon: '🟨', value: 25 },
  { id: 'p50', label: '50%',  sublabel: 'Ness',     icon: '🟧', value: 50 },
  { id: 'p75', label: '75%',  sublabel: 'Tlata rbaa', icon: '🟥', value: 75 },
  { id: 'p100',label: '100%', sublabel: 'Kamml',    icon: '✅', value: 100 },
];

export const STATUS_TILES = [
  { id: 'enc', label: 'En cours',  sublabel: 'Kaydayer', icon: '🔨', value: 'en_cours' },
  { id: 'pau', label: 'En pause',  sublabel: 'Waqef',    icon: '⏸️', value: 'en_pause' },
  { id: 'ter', label: 'Terminé',   sublabel: 'Kammla',   icon: '✅', value: 'termine' },
  { id: 'pro', label: 'Problème',  sublabel: 'Mushkila', icon: '⚠️', value: 'probleme' },
];
