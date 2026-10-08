import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ToggleLikeResult {
  liked: boolean;
  likeCount: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class LikeService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(photoId: string, userId: string): Promise<ToggleLikeResult> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.status !== 'ACTIVE') {
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    }

    let liked: boolean;
    try {
      await this.prisma.like.create({ data: { userId, photoId } });
      liked = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // unique 제약 위반 = 이미 좋아요가 있다는 뜻 — 일반적인 "취소" 경로(두 번째
      // 클릭)와 동시 요청 레이스(동시에 두 번 호출) 둘 다 여기로 들어온다. 둘 다
      // 토글 의미상 지우는 게 맞다.
      await this.prisma.like.deleteMany({ where: { userId, photoId } });
      liked = false;
    }

    const likeCount = await this.prisma.like.count({ where: { photoId } });
    return { liked, likeCount };
  }
}
