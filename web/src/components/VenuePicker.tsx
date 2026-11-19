import type { Venue } from '@badmintonsmash/shared';
import { useEffect, useRef, useState } from 'react';

import { Button, Field } from '@/components/ui';
import { env } from '@/env';
import { useLocale, useT } from '@/i18n';

/** Rough centre of Metro Vancouver; results are biased to this circle and restricted to Canada. */
const VANCOUVER = { lat: 49.19, lng: -123.05 };
const BIAS_RADIUS_M = 45_000;

let mapsLoading: Promise<void> | undefined;

function loadGoogleMaps(key: string, language: string): Promise<void> {
  const existing = (globalThis as { google?: typeof google }).google;
  if (existing?.maps?.importLibrary) return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<void>((resolve, reject) => {
    // With loading=async the script's own load event fires before google.maps is populated;
    // Google invokes the named callback once importLibrary and the core are ready.
    const callbackName = '__badmintonSmashMapsReady';
    (window as unknown as Record<string, unknown>)[callbackName] = () => resolve();
    const s = document.createElement('script');
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', language, region: 'CA', callback: callbackName });
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => {
      mapsLoading = undefined;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(s);
  });
  return mapsLoading;
}

export function mapsLink(v: Venue): string | undefined {
  if (v.mapUrl) return v.mapUrl;
  if (v.lat !== undefined && v.lng !== undefined) {
    const q = new URLSearchParams({ api: '1', query: `${v.lat},${v.lng}` });
    if (v.placeId) q.set('query_place_id', v.placeId);
    return `https://www.google.com/maps/search/?${q.toString()}`;
  }
  if (v.address || v.name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address ?? v.name)}`;
  return undefined;
}

interface Props {
  value: Venue;
  onChange: (v: Venue) => void;
  error?: string;
}

export function VenuePicker({ value, onChange, error }: Props) {
  const t = useT();
  const locale = useLocale();
  const hasMaps = env.googleMapsKey.length > 0;
  const [manual, setManual] = useState(!hasMaps);
  const [mapsFailed, setMapsFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hasMaps || manual) return undefined;
    let cancelled = false;
    let element: HTMLElement | undefined;
    loadGoogleMaps(env.googleMapsKey, locale)
      .then(async () => {
        const places = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
        if (cancelled || !hostRef.current) return;
        const ac = new places.PlaceAutocompleteElement({
          includedRegionCodes: ['ca'],
          locationBias: { center: VANCOUVER, radius: BIAS_RADIUS_M },
        });
        ac.addEventListener('gmp-select', (ev: Event) => {
          const prediction = (ev as google.maps.places.PlacePredictionSelectEvent).placePrediction;
          const place = prediction.toPlace();
          void place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id', 'googleMapsURI'] }).then(() => {
            const next: Venue = {
              name: (place.displayName ?? '').slice(0, 80) || prediction.mainText?.toString() || '',
              address: place.formattedAddress ?? undefined,
              mapUrl: place.googleMapsURI ?? undefined,
              placeId: place.id,
              lat: place.location?.lat(),
              lng: place.location?.lng(),
            };
            onChangeRef.current(next);
          });
        });
        hostRef.current.replaceChildren(ac);
        element = ac;
      })
      .catch((e: unknown) => {
        console.error("Google Maps venue search unavailable; falling back to manual entry", e);
        setMapsFailed(true);
      });
    return () => {
      cancelled = true;
      element?.remove();
    };
  }, [hasMaps, manual, locale]);

  const picked = !!value.placeId;

  if (manual || mapsFailed) {
    return (
      <>
        <Field label={t.form.venueName} error={error}>
          <input className={`input ${error ? 'invalid' : ''}`} value={value.name} maxLength={80} onChange={(e) => onChange({ ...value, name: e.target.value, placeId: undefined, lat: undefined, lng: undefined })} />
        </Field>
        <Field label={t.form.address} optional={t.common.optional}>
          <input className="input" value={value.address ?? ''} maxLength={200} onChange={(e) => onChange({ ...value, address: e.target.value || undefined })} />
        </Field>
        <Field label={t.form.mapUrl} optional={t.common.optional}>
          <input className="input" type="url" inputMode="url" value={value.mapUrl ?? ''} maxLength={500} onChange={(e) => onChange({ ...value, mapUrl: e.target.value || undefined })} />
        </Field>
        {hasMaps && !mapsFailed ? (
          <Button variant="ghost" small onClick={() => setManual(false)}>
            {t.form.useSearch}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <>
      {picked ? (
        <div className="card">
          <div className="title">{value.name}</div>
          {value.address ? <div className="muted small">{value.address}</div> : null}
          <div className="row">
            {mapsLink(value) ? (
              <a href={mapsLink(value)} target="_blank" rel="noreferrer" className="small">
                {t.form.mapUrl} ↗
              </a>
            ) : null}
            <Button variant="ghost" small className="right" onClick={() => onChange({ name: '' })}>
              {t.common.change}
            </Button>
          </div>
        </div>
      ) : (
        <Field label={t.form.venueSearch} hint={t.form.venueSearchHint} error={error}>
          <div ref={hostRef} className="places-host" />
        </Field>
      )}
      <Button variant="ghost" small onClick={() => setManual(true)}>
        {t.form.enterManually}
      </Button>
    </>
  );
}
