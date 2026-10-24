import Supercluster from 'supercluster';
import { toGeoJSONPoint } from './geo-convert';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  thumbnailUrl: string;
}

export interface PinMarker {
  type: 'pin';
  id: string;
  lat: number;
  lng: number;
}

export interface ClusterMarker {
  type: 'cluster';
  id: number;
  lat: number;
  lng: number;
  count: number;
  // 클릭 시 확장할 표준 zoom 값 — 클러스터 생성 시점에 미리 계산해둔다(지도
  // 컴포넌트가 supercluster 인덱스 자체에 접근할 필요가 없게).
  expansionZoom: number;
}

export type MapMarker = PinMarker | ClusterMarker;

export interface ClusterResult {
  markers: MapMarker[];
  leafToClusterId: Map<string, number>;
}

// PRD 기능4 "업계 일반값" — supercluster 자체 기본값과 동일(maxZoom 16은
// 표준 zoom 스케일, 카카오 level이 아님 — geo-convert.ts 참고).
const CLUSTER_RADIUS = 60;
const CLUSTER_MAX_ZOOM = 16;

export function computeClusters(pins: MapPin[], bbox: [number, number, number, number], zoom: number): ClusterResult {
  const index = new Supercluster<{ pinId: string }>({ radius: CLUSTER_RADIUS, maxZoom: CLUSTER_MAX_ZOOM });
  index.load(
    pins.map((pin) => ({
      type: 'Feature' as const,
      properties: { pinId: pin.id },
      geometry: { type: 'Point' as const, coordinates: toGeoJSONPoint(pin.lat, pin.lng) },
    })),
  );

  const features = index.getClusters(bbox, Math.round(zoom));
  const markers: MapMarker[] = [];
  const leafToClusterId = new Map<string, number>();

  for (const feature of features) {
    const [lng, lat] = feature.geometry.coordinates;
    if ('cluster' in feature.properties && feature.properties.cluster) {
      const clusterId = feature.properties.cluster_id;
      markers.push({
        type: 'cluster',
        id: clusterId,
        lat,
        lng,
        count: feature.properties.point_count,
        expansionZoom: index.getClusterExpansionZoom(clusterId),
      });
      for (const leaf of index.getLeaves(clusterId, Infinity)) {
        leafToClusterId.set(leaf.properties.pinId, clusterId);
      }
    } else {
      markers.push({ type: 'pin', id: feature.properties.pinId, lat, lng });
    }
  }

  return { markers, leafToClusterId };
}
