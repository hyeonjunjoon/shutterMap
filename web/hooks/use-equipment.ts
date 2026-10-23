import { useQuery } from '@tanstack/react-query';
import { fetchEquipment, type EquipmentOptions } from '@/lib/discovery-api';
import { queryKeys } from '@/lib/query-keys';

export function useEquipment() {
  return useQuery<EquipmentOptions>({
    queryKey: queryKeys.discovery.equipment,
    queryFn: fetchEquipment,
  });
}
