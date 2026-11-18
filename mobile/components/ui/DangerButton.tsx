/**
 * Pulsante per eliminare (spec 2.1). A contorno rosso di norma; `filled` solo
 * nel passo di conferma ("Sì, elimina").
 */
import React from 'react';
import { ButtonBase, type ButtonProps } from './ButtonBase';

export default function DangerButton({ filled, icon, ...props }: ButtonProps & { filled?: boolean }) {
  return <ButtonBase {...props} variant={filled ? 'dangerFilled' : 'danger'} icon={icon ?? 'trash-outline'} />;
}
