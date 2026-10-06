import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notificationsApi from "../api/notifications";
import { useAuth } from "./useAuth";

function queryKeyFor(userId?: string) {
  return ["notifications", userId] as const;
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeyFor(user?.id),
    queryFn: () => notificationsApi.getNotifications(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useMarkNotificationAsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markNotificationAsRead(user!.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeyFor(user?.id) }),
  });
}

export function useMarkAllNotificationsAsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllNotificationsAsRead(user!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeyFor(user?.id) }),
  });
}