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
      // 동시에 같은 사용자가 두 번 토글해서 create가 unique 제약에 걸렸다는 뜻 —
      // 이미 좋아요가 있는 상태이므로 토글 의미상 지운다.
      await this.prisma.like.deleteMany({ where: { userId, photoId } });
      liked = false;
    }

    const likeCount = await this.prisma.like.count({ where: { photoId } });
    return { liked, likeCount };
  }
}
