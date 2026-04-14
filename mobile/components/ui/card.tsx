import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

export type CardProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function Card({ style, lightColor, darkColor, ...otherProps }: CardProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor ?? '#F3F4F6', dark: darkColor ?? '#23272F' },
    'background'
  );
  return <View style={[styles.card, { backgroundColor }, style]} {...otherProps} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
});
