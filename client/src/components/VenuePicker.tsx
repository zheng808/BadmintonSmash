import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { env } from '@/lib/env';

export interface VenueValue {
  name: string;
  address: string;
  mapUrl: string;
  placeId?: string;
  lat?: number;
  lng?: number;
}

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

interface AutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }>;
}

interface PlaceDetails {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
}

const PLACES = 'https://places.googleapis.com/v1';
/** Bias results to Metro Vancouver. */
const LOCATION_BIAS = { circle: { center: { latitude: 49.17, longitude: -123.1 }, radius: 40000 } };

function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function autocomplete(input: string, sessionToken: string, key: string, signal: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({ input, sessionToken, locationBias: LOCATION_BIAS, includedRegionCodes: ['ca'] }),
    signal,
  });
  if (!res.ok) throw new Error(`Places autocomplete failed (${res.status})`);
  const json = (await res.json()) as AutocompleteResponse;
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId ?? '',
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

async function placeDetails(placeId: string, sessionToken: string, key: string): Promise<VenueValue> {
  const res = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,googleMapsUri' },
  });
  if (!res.ok) throw new Error(`Place details failed (${res.status})`);
  const p = (await res.json()) as PlaceDetails;
  return {
    name: (p.displayName?.text ?? '').slice(0, 80),
    address: (p.formattedAddress ?? '').slice(0, 200),
    mapUrl: p.googleMapsUri ?? '',
    placeId: p.id ?? placeId,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
  };
}

interface VenuePickerProps {
  value: VenueValue;
  onChange: (v: VenueValue) => void;
  error?: string;
}

/**
 * Venue entry. With EXPO_PUBLIC_GOOGLE_MAPS_KEY: Places API (New) autocomplete + details, one session
 * token per search session (billed as a single Autocomplete session). Without a key: manual fields.
 */
export function VenuePicker({ value, onChange, error }: VenuePickerProps) {
  const t = useT();
  const theme = useTheme();
  const key = env.googleMapsKey;
  const [manual, setManual] = useState(!key);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [searched, setSearched] = useState(false);
  const sessionToken = useRef(newSessionToken());
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Debounced autocomplete.
  useEffect(() => {
    if (!key || manual) return undefined;
    const input = query.trim();
    if (input.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return undefined;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchError(undefined);
      try {
        const results = await autocomplete(input, sessionToken.current, key, controller.signal);
        if (id === requestId.current) {
          setSuggestions(results);
          setSearched(true);
        }
      } catch (e) {
        if (id === requestId.current && !(e instanceof Error && e.name === 'AbortError')) {
          setSearchError(t.form.venueError);
          setSuggestions([]);
        }
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, key, manual]);

  const select = async (s: Suggestion) => {
    setSuggestions([]);
    setSearching(true);
    setSearchError(undefined);
    try {
      const details = await placeDetails(s.placeId, sessionToken.current, key);
      onChange(details.name ? details : { ...details, name: s.main });
      setQuery('');
    } catch {
      // Fall back to what the suggestion already told us.
      onChange({ name: s.main.slice(0, 80), address: s.secondary.slice(0, 200), mapUrl: '', placeId: s.placeId });
      setSearchError(t.form.venueError);
    } finally {
      sessionToken.current = newSessionToken(); // a details call ends the billing session
      setSearching(false);
      setSearched(false);
    }
  };

  const clear = () => {
    onChange({ name: '', address: '', mapUrl: '' });
    setQuery('');
  };

  if (manual) {
    return (
      <View style={styles.wrap}>
        <TextField label={t.form.venueName} value={value.name} onChangeText={(v) => onChange({ ...value, name: v, placeId: undefined, lat: undefined, lng: undefined })} error={error} maxLength={80} />
        <TextField label={t.form.address} value={value.address} onChangeText={(v) => onChange({ ...value, address: v })} optional={t.common.optional} />
        <TextField label={t.form.mapUrl} value={value.mapUrl} onChangeText={(v) => onChange({ ...value, mapUrl: v })} autoCapitalize="none" keyboardType="url" optional={t.common.optional} />
        {key ? <Button title={t.form.venueUseSearch} variant="ghost" size="sm" style={styles.inline} onPress={() => setManual(false)} /> : null}
      </View>
    );
  }

  const hasSelection = value.name.length > 0;
  return (
    <View style={styles.wrap}>
      {hasSelection ? (
        <View style={[styles.selected, { borderColor: error ? theme.danger : theme.border, backgroundColor: theme.surfaceAlt }]}>
          <AppText variant="label">{t.form.venueSelected}</AppText>
          <AppText variant="bodyBold">{value.name}</AppText>
          {value.address ? <AppText variant="secondary">{value.address}</AppText> : null}
          <View style={styles.row}>
            <Button title={t.form.venueChange} variant="secondary" size="sm" onPress={clear} />
            <Button title={t.form.venueManual} variant="ghost" size="sm" onPress={() => setManual(true)} />
          </View>
        </View>
      ) : (
        <>
          <TextField
            label={t.form.venueName}
            placeholder={t.form.venueSearch}
            value={query}
            onChangeText={setQuery}
            error={error}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {searching ? (
            <View style={styles.row}>
              <Spinner />
              <AppText variant="small">{t.form.venueSearching}</AppText>
            </View>
          ) : null}
          {suggestions.length > 0 ? (
            <View style={[styles.list, { borderColor: theme.border, backgroundColor: theme.surface }]} accessibilityRole="list">
              {suggestions.map((s) => (
                <Pressable key={s.placeId} accessibilityRole="button" onPress={() => void select(s)} style={({ pressed }) => [styles.item, { borderColor: theme.border }, pressed && { backgroundColor: theme.surfaceAlt }]}>
                  <AppText variant="bodyBold">{s.main}</AppText>
                  {s.secondary ? <AppText variant="small">{s.secondary}</AppText> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {searched && !searching && suggestions.length === 0 ? <AppText variant="small">{t.form.venueNoResults}</AppText> : null}
          {searchError ? (
            <AppText variant="small" color="danger">
              {searchError}
            </AppText>
          ) : null}
          <Button title={t.form.venueManual} variant="ghost" size="sm" style={styles.inline} onPress={() => setManual(true)} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  inline: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  selected: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs },
  list: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  item: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth },
});
