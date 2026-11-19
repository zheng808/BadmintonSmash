import type {
  AddSignupInput,
  CancelEventInput,
  CreateEventInput,
  EventDetail,
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

import { api, isApiError, queryString } from '@/api/client';
import { useSession } from '@/auth/session';

export const keys = {
  me: ['me'] as const,
  money: ['me', 'money'] as const,
  events: (scope: EventScope) => ['events', scope] as const,
  publicEvents: (q: string) => ['public-events', q] as const,
  event: (id: string) => ['event', id] as const,
  settlement: (id: string) => ['event', id, 'settlement'] as const,
};

function useSignedIn(): boolean {
  return useSession().session.status === 'signedIn';
}

export function useMe(enabledOverride?: boolean) {
  const enabled = enabledOverride ?? useSignedIn();
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Profile>('/me'), enabled });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.put<Profile>('/me', input),
    onSuccess: (profile) => qc.setQueryData(keys.me, profile),
  });
}

export function useDeleteMe() {
  return useMutation({ mutationFn: () => api.delete<void>('/me') });
}

export function useMoney() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: keys.money, queryFn: () => api.get<MoneySummary>('/me/money'), enabled });
}

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
    queryFn: () => api.getPublic<Paginated<EventSummary>>(`/public/events${queryString({ q: q || undefined, limit: 50 })}`),
  });
}

export type EventView = { kind: 'detail'; detail: EventDetail } | { kind: 'public'; event: EventPublic };

/** Full detail when signed in (falls back to the public view on 403/404), public view when signed out. */
export function useEvent(eventId: string) {
  const { session } = useSession();
  const signedIn = session.status === 'signedIn';
  return useQuery({
    queryKey: [...keys.event(eventId), signedIn ? 'auth' : 'public'],
    enabled: session.status !== 'loading' && eventId.length > 0,
    queryFn: async (): Promise<EventView> => {
      if (signedIn) {
        try {
          const detail = await api.get<EventDetail>(`/events/${eventId}`);
          return { kind: 'detail', detail };
        } catch (e) {
          if (!isApiError(e) || (e.status !== 403 && e.status !== 404)) throw e;
        }
      }
      const event = await api.getPublic<EventPublic>(`/public/events/${eventId}`);
      return { kind: 'public', event };
    },
  });
}

function useInvalidateEvent(eventId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.event(eventId) });
    void qc.invalidateQueries({ queryKey: ['events'] });
    void qc.invalidateQueries({ queryKey: keys.money });
  };
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.post<EventDetail>('/events', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({ mutationFn: (input: UpdateEventInput) => api.patch<EventDetail>(`/events/${eventId}`, input), onSuccess: invalidate });
}

export type EventAction = 'publish' | 'close' | 'reopen' | 'complete' | 'cancel';

export function useEventAction(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({
    mutationFn: (vars: { action: EventAction; body?: CancelEventInput }) => api.post<EventDetail>(`/events/${eventId}/${vars.action}`, vars.body ?? {}),
    onSuccess: invalidate,
  });
}

export function useJoin(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({ mutationFn: (input: JoinInput = {}) => api.post<JoinResult>(`/events/${eventId}/signups`, input), onSuccess: invalidate });
}

export function useLeave(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({ mutationFn: () => api.delete<{ signup: Signup }>(`/events/${eventId}/signups/me`), onSuccess: invalidate });
}

export function useUpdateMySignup(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({
    mutationFn: (input: UpdateMySignupInput) => api.patch<{ signup: Signup }>(`/events/${eventId}/signups/me`, input),
    onSuccess: invalidate,
  });
}

export function useHostUpdateSignup(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({
    mutationFn: (vars: { userId: string; input: HostUpdateSignupInput }) =>
      api.patch<{ signup: Signup }>(`/events/${eventId}/signups/${vars.userId}`, vars.input),
    onSuccess: invalidate,
  });
}

export function useRemoveSignup(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({
    mutationFn: (vars: { userId: string; input?: RemoveSignupInput }) =>
      api.delete<{ signup: Signup }>(`/events/${eventId}/signups/${vars.userId}`, vars.input ?? {}),
    onSuccess: invalidate,
  });
}

export function useAddSignup(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  return useMutation({ mutationFn: (input: AddSignupInput) => api.post<JoinResult>(`/events/${eventId}/signups/add`, input), onSuccess: invalidate });
}

export function useSettlement(eventId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.settlement(eventId), queryFn: () => api.get<Settlement | null>(`/events/${eventId}/settlement`), enabled });
}

export function useSettlementPreview(eventId: string) {
  return useMutation({ mutationFn: (input: SettlementInput) => api.post<SettlementResult>(`/events/${eventId}/settlement/preview`, input) });
}

export function useFinalize(eventId: string) {
  const invalidate = useInvalidateEvent(eventId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettlementInput) => api.post<FinalizeResult>(`/events/${eventId}/settlement/finalize`, input),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: keys.settlement(eventId) });
    },
  });
}
