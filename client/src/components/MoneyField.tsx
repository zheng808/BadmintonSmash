import { formatCents, parseMoneyToCents, type Currency } from '@badmintonsmash/shared';
import { useEffect, useState } from 'react';

import { TextField, type TextFieldProps } from '@/components/TextField';
import { useT } from '@/i18n';

interface MoneyFieldProps extends Omit<TextFieldProps, 'value' | 'onChangeText'> {
  cents: number | undefined;
  onChangeCents: (cents: number | undefined) => void;
  currency: Currency;
}

function centsToText(cents: number | undefined): string {
  return cents === undefined ? '' : (cents / 100).toFixed(2);
}

/** Decimal money input that stores integer cents. Keeps the raw text while editing. */
export function MoneyField({ cents, onChangeCents, currency, error, ...rest }: MoneyFieldProps) {
  const t = useT();
  const [text, setText] = useState(centsToText(cents));
  const [localError, setLocalError] = useState<string | undefined>();

  useEffect(() => {
    if (parseMoneyToCents(text) !== cents) setText(centsToText(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);

  return (
    <TextField
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder={formatCents(0, currency)}
      value={text}
      onChangeText={(v) => {
        setText(v);
        if (v.trim() === '') {
          setLocalError(undefined);
          onChangeCents(undefined);
          return;
        }
        const parsed = parseMoneyToCents(v);
        setLocalError(parsed === undefined ? t.form.invalidMoney : undefined);
        if (parsed !== undefined) onChangeCents(parsed);
      }}
      error={error ?? localError}
      {...rest}
    />
  );
}
