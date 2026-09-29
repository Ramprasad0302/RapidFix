import { useQuery } from '@tanstack/react-query';
import { catalogApi, notificationApi } from '../../lib/endpoints';
import { useAuth } from '../../store/auth';

/** Categories rarely change — cache for 30 min so slow networks aren't hit on every screen. */
export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: catalogApi.categories, staleTime: 30 * 60_000 });

export const useLocations = () =>
  useQuery({ queryKey: ['locations'], queryFn: catalogApi.locations, staleTime: 60 * 60_000 });

export function useUnreadCount() {
  const authed = useAuth((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: notificationApi.unreadCount,
    enabled: authed,
    refetchInterval: 60_000,
    select: (d) => d.count,
  });
}
