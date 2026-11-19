import type {
  AddSignupInput,
  CancelEventInput,
  CreateEventInput,
  DuplicateEventInput,
  Event,
  EventDetail,
  EventHost,
  EventMe,
  EventPublic,
  EventScope,
  EventSummary,
  FinalizeResult,
  HostUpdateSignupInput,
  JoinInput,
  JoinResult,
  MoneySummary,
  Paginated,
  Profile,
  RemoveSignupInput,
  Settlement,
  SettlementInput,
  SettlementResult,
  Signup,
  UpdateEventInput,
  UpdateMySignupInput,
  UpdateProfileInput,
} from '@badmintonsmash/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, queryString } from '@/api/client';
import { keys } from '@/api/keys';
import { useSession } from '@/auth/session';

function useSignedIn(): boolean {
  return useSession().session.status === 'signedIn';
}

// ---------- me ----------

export function useMe() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Profile>('/me'), enabled });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.put<Profile>('/me', input),
    onSuccess: (profile) => {
      qc.setQueryData(keys.me, profile);
      void qc.invalidateQueries({ queryKey: keys.allEvents });
    },
  });
}

export function useDeleteMe() {
  return useMutation({ mutationFn: () => api.delete<void>('/me') });
}

export function useMoney() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: keys.money, queryFn: () => api.get<MoneySummary>('/me/money'), enabled });
}

// ---------- events ----------

export function useEvents(scope: EventScope) {
  const enabled = useSignedIn();
  return useQuery({
    queryKey: keys.events(scope),
    queryFn: () => api.get<Paginated<EventSummary>>(`/events${queryString({ scope, limit: 50 })}`),
    enabled,
  });
}

export function usePublicEvents(q: string) {
  return useQuery({
    queryKey: keys.publicEvents(q),
    queryFn: () => api.get<Paginated<EventSummary>>(`/public/events${queryString({ q: q || undefined, limit: 50 })}`),
  });
}

/** Unified event view: full detail when signed in, redacted public view otherwise. */
export interface EventView {
  event: Event;
  roster: EventDetail['roster'];
  me: EventMe;
  /** Host profile with payment handles; absent in the signed-out public view. */
  host?: EventHost;
  publicView: boolean;
}

export function useEvent(eventId: string | undefined) {
  const signedIn = useSignedIn();
  const { session } = useSession();
  return useQuery({
    queryKey: [...keys.event(eventId ?? ''), signedIn ? 'auth' : 'public'],
    enabled: !!eventId && session.status !== 'loading',
    queryFn: async (): Promise<EventView> => {
      if (signedIn) {
        const d = await api.get<EventDetail>(`/events/${eventId}`);
        return { ...d, publicView: false };
      }
      const event = await api.get<EventPublic>(`/public/events/${eventId}`);
      return { event, roster: [], me: { isHost: false, canJoin: false }, host: undefined, publicView: true };
    },
  });
}

function useInvalidateEvent() {
  const qc = useQueryClient();
  return (eventId?: string) => {
    if (eventId) void qc.invalidateQueries({ queryKey: keys.event(eventId) });
    void qc.invalidateQueries({ queryKey: keys.allEvents });
    void qc.invalidateQueries({ queryKey: keys.allPublicEvents });
    void qc.invalidateQueries({ queryKey: keys.money });
  };
}

export function useCreateEvent() {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.post<EventDetail>('/events', input),
    onSuccess: (d) => invalidate(d.event.eventId),
  });
}

export function useUpdateEvent(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: UpdateEventInput) => api.patch<EventDetail>(`/events/${eventId}`, input),
    onSuccess: () => invalidate(eventId),
  });
}

export type EventAction = 'publish' | 'close' | 'reopen' | 'complete' | 'cancel' | 'duplicate';

export function useEventAction(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (vars: { action: EventAction; body?: CancelEventInput | DuplicateEventInput }) =>
      api.post<EventDetail>(`/events/${eventId}/${vars.action}`, vars.body ?? {}),
    onSuccess: (d) => {
      invalidate(eventId);
      if (d.event.eventId !== eventId) invalidate(d.event.eventId);
    },
  });
}

// ---------- signups ----------

export function useJoin(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: JoinInput = {}) => api.post<JoinResult>(`/events/${eventId}/signups`, input),
    onSuccess: () => invalidate(eventId),
  });
}

export function useLeave(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: () => api.delete<{ signup: Signup }>(`/events/${eventId}/signups/me`),
    onSuccess: () => invalidate(eventId),
  });
}

export function useUpdateMySignup(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: UpdateMySignupInput) => api.patch<{ signup: Signup }>(`/events/${eventId}/signups/me`, input),
    onSuccess: () => invalidate(eventId),
  });
}

export function useHostUpdateSignup(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (vars: { userId: string; input: HostUpdateSignupInput }) =>
      api.patch<{ signup: Signup }>(`/events/${eventId}/signups/${vars.userId}`, vars.input),
    onSuccess: () => invalidate(eventId),
  });
}

export function useRemoveSignup(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (vars: { userId: string; input?: RemoveSignupInput }) =>
      api.delete<{ signup: Signup }>(`/events/${eventId}/signups/${vars.userId}`, vars.input ?? {}),
    onSuccess: () => invalidate(eventId),
  });
}

export function useAddSignup(eventId: string) {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: AddSignupInput) => api.post<JoinResult>(`/events/${eventId}/signups/add`, input),
    onSuccess: () => invalidate(eventId),
  });
}

// ---------- settlement ----------

export function useSettlement(eventId: string, enabled = true) {
  return useQuery({
    queryKey: keys.settlement(eventId),
    queryFn: () => api.get<Settlement | null>(`/events/${eventId}/settlement`),
    enabled,
  });
}

export function useSettlementPreview(eventId: string) {
  return useMutation({
    mutationFn: (input: SettlementInput) => api.post<SettlementResult>(`/events/${eventId}/settlement/preview`, input),
  });
}

export function useFinalize(eventId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: SettlementInput) => api.post<FinalizeResult>(`/events/${eventId}/settlement/finalize`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.settlement(eventId) });
      invalidate(eventId);
    },
  });
}
