import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}
interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  initialValue?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric';
}
export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  destructive?: boolean;
}
interface ChooseOptions<T extends string> {
  title: string;
  message?: string;
  options: readonly ChoiceOption<T>[];
}

interface DialogApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | undefined>;
  choose: <T extends string>(o: ChooseOptions<T>) => Promise<T | undefined>;
  toast: (message: string) => void;
  alert: (title: string, message?: string) => Promise<void>;
}

type Pending =
  | { kind: 'confirm'; o: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; o: PromptOptions; resolve: (v: string | undefined) => void }
  | { kind: 'choose'; o: ChooseOptions<string>; resolve: (v: string | undefined) => void }
  | { kind: 'alert'; o: ConfirmOptions; resolve: () => void };

const DialogContext = createContext<DialogApi | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | undefined>();
  const [toastMsg, setToastMsg] = useState<string | undefined>();
  const [promptValue, setPromptValue] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const theme = useTheme();
  const t = useT();

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (o) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', o, resolve })),
      prompt: (o) =>
        new Promise<string | undefined>((resolve) => {
          setPromptValue(o.initialValue ?? '');
          setPending({ kind: 'prompt', o, resolve });
        }),
      choose: <T extends string>(o: ChooseOptions<T>) =>
        new Promise<T | undefined>((resolve) =>
          setPending({ kind: 'choose', o: o as ChooseOptions<string>, resolve: (v) => resolve(v as T | undefined) }),
        ),
      alert: (title, message) => new Promise<void>((resolve) => setPending({ kind: 'alert', o: { title, message }, resolve })),
      toast: (message) => {
        setToastMsg(message);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(undefined), 2500);
      },
    }),
    [],
  );

  const close = useCallback(
    (result: unknown) => {
      if (!pending) return;
      setPending(undefined);
      (pending.resolve as (v: unknown) => void)(result);
    },
    [pending],
  );

  const o = pending?.o;
  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => close(pending?.kind === 'confirm' ? false : undefined)}>
        <Pressable style={styles.backdrop} onPress={() => close(pending?.kind === 'confirm' ? false : undefined)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => undefined}>
            {o ? (
              <>
                <AppText variant="heading">{o.title}</AppText>
                {o.message ? <AppText variant="secondary">{o.message}</AppText> : null}
              </>
            ) : null}
            {pending?.kind === 'prompt' ? (
              <View style={styles.gap}>
                {pending.o.label ? <AppText variant="label">{pending.o.label}</AppText> : null}
                <TextInput
                  autoFocus
                  value={promptValue}
                  onChangeText={setPromptValue}
                  placeholder={pending.o.placeholder}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType={pending.o.keyboardType ?? 'default'}
                  autoCapitalize="none"
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>
            ) : null}
            {pending?.kind === 'choose' ? (
              <View style={styles.gap}>
                {pending.o.options.map((opt) => (
                  <Button key={opt.value} title={opt.label} variant={opt.destructive ? 'destructive' : 'secondary'} onPress={() => close(opt.value)} />
                ))}
                <Button title={t.common.cancel} variant="ghost" onPress={() => close(undefined)} />
              </View>
            ) : pending?.kind === 'alert' ? (
              <Button title={t.common.close} onPress={() => close(undefined)} />
            ) : pending ? (
              <View style={styles.actions}>
                <Button title={pending.o.cancelLabel ?? t.common.cancel} variant="secondary" onPress={() => close(pending.kind === 'confirm' ? false : undefined)} style={styles.action} />
                <Button
                  title={pending.o.confirmLabel ?? t.common.confirm}
                  variant={pending.o.destructive ? 'destructive' : 'primary'}
                  onPress={() => close(pending.kind === 'confirm' ? true : promptValue)}
                  style={styles.action}
                />
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      {toastMsg ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={[styles.toast, { backgroundColor: theme.text }]}>
            <AppText color="background">{toastMsg}</AppText>
          </View>
        </View>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  sheet: { width: '100%', maxWidth: 420, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  gap: { gap: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  action: { flex: 1 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center' },
  toast: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderRadius: Radius.pill },
});
