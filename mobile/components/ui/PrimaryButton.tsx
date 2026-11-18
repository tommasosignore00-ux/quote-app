/** Pulsante principale: arancio pieno. Uno solo visibile per schermata (spec 2.1). */
import React from 'react';
import { ButtonBase, type ButtonProps } from './ButtonBase';

export default function PrimaryButton(props: ButtonProps) {
  return <ButtonBase variant="primary" {...props} />;
}
