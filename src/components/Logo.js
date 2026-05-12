import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { Colors } from '../theme';

export default function Logo({ size = 32, textSize = 18, showText = true, light = true }) {
  return (
    <View style={styles.row}>
      <Svg width={size} height={size} viewBox="0 0 42 42" fill="none">
        <Rect width="42" height="42" rx="10" fill="#E8B84B" />
        <Path d="M9 24 L21 12 L33 24" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M13 24 L13 32 L29 32 L29 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Rect x="18" y="25" width="6" height="7" rx="1" fill="#1A1A1A" />
      </Svg>
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
  text: { fontWeight: '600', letterSpacing: -0.3 },
});
