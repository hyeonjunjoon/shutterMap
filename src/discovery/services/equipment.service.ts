import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EquipmentList {
  cameraNames: string[];
  lensNames: string[];
}

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // 업로드 미리보기 자동완성 + 지도/갤러리 필터 드롭다운에 쓴다 (PRD 기능8 특이사항).
  // 공개 조회라서 다른 discovery 엔드포인트와 동일하게 status: 'ACTIVE'만 본다 —
  // 비공개/삭제된 사진에만 있는 장비명이 드롭다운에 노출되지 않게.
  async listDistinctNames(): Promise<EquipmentList> {
    const [cameras, lenses] = await Promise.all([
      this.prisma.photo.findMany({
        where: { status: 'ACTIVE', cameraName: { not: null } },
        select: { cameraName: true },
        distinct: ['cameraName'],
      }),
      this.prisma.photo.findMany({
        where: { status: 'ACTIVE', lensName: { not: null } },
        select: { lensName: true },
        distinct: ['lensName'],
      }),
    ]);

    return {
      cameraNames: cameras.map((p) => p.cameraName as string).sort(),
      lensNames: lenses.map((p) => p.lensName as string).sort(),
    };
  }
}
