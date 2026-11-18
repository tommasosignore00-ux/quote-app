/**
 * Il marchio Mastrovoce: per ora l'icona dell'app (assets/icon.png).
 * Il simbolo vettoriale (brand/mastrovoce-simbolo.svg) richiederebbe react-native-svg,
 * che non è installato.
 */
import React from 'react';
import { Image } from 'react-native';

export default function BrandMark({ size = 96 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
      accessibilityRole="image"
      accessibilityLabel="Mastrovoce"
    />
  );
}
