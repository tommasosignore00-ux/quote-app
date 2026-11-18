/** Pulsante secondario: contorno 2pt inchiostro. "Annulla" usa sempre questo (spec 2.1). */
import React from 'react';
import { ButtonBase, type ButtonProps } from './ButtonBase';

export default function SecondaryButton(props: ButtonProps) {
  return <ButtonBase variant="secondary" {...props} />;
}
