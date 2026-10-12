import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LikeService } from './like.service';
import { PrismaService } from '../../prisma/prisma.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('LikeService.toggle', () => {
  let service: LikeService;
  let prisma: {
    photo: { findUnique: jest.Mock };
    like: { create: jest.Mock; deleteMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      photo: { findUnique: jest.fn() },
      like: { create: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LikeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LikeService);
  });

  it('throws NotFoundException when the photo does not exist', async () => {
    prisma.photo.findUnique.mockResolvedValue(null);

    await expect(service.toggle('missing-photo', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the photo is not ACTIVE', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'HIDDEN' });

    await expect(service.toggle('p1', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('creates a like on the first toggle', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    prisma.like.create.mockResolvedValue({ id: 'l1' });
    prisma.like.count.mockResolvedValue(1);

    const result = await service.toggle('p1', 'u1');

    expect(result).toEqual({ liked: true, likeCount: 1 });
    expect(prisma.like.deleteMany).not.toHaveBeenCalled();
  });

  it('recovers by deleting when two concurrent toggles race to create the same like (TOCTOU)', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    prisma.like.create.mockRejectedValue(uniqueConstraintError());
    prisma.like.deleteMany.mockResolvedValue({ count: 1 });
    prisma.like.count.mockResolvedValue(0);

    const result = await service.toggle('p1', 'u1');

    expect(result).toEqual({ liked: false, likeCount: 0 });
    expect(prisma.like.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', photoId: 'p1' } });
  });

  it('rethrows non-uniqueness errors as-is', async () => {
    prisma.photo.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    prisma.like.create.mockRejectedValue(new Error('db is down'));

    await expect(service.toggle('p1', 'u1')).rejects.toThrow('db is down');
  });
});
