import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme';

export default function Logo({ size = 32, textSize = 18, showText = true, light = true }) {
  const iconSize = size;
  const radius = iconSize * 0.238;
  const houseSize = iconSize * 0.55;
  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, { width: iconSize, height: iconSize, borderRadius: radius }]}>
        <Text style={{ fontSize: houseSize, lineHeight: iconSize * 1.05 }}>🏠</Text>
      </View>
      {showText && (
        <Text style={[styles.text, { fontSize: textSize, color: light ? '#fff' : Colors.ink }]}>
          Shanti<Text style={{ color: Colors.gold }}>Link</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '600', letterSpacing: -0.3 },
});
