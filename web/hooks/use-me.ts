import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface Me {
  id: string;
  email: string;
  ownedCameraName: string | null;
  ownedCameraRaw: string | null;
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await apiClient<Me>('/auth/me');
      } catch (error) {
        // 비로그인(401)은 에러가 아니라 정상 상태다 — 토스트/에러 바운더리로
        // 새지 않게 여기서 null로 변환한다.
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
  });
}
