import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AuthService.register', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('creates a user with a hashed password', async () => {
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    const result = await service.register({ email: 'a@b.com', password: 'password123' });

    expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.passwordHash).not.toBe('password123'); // hashed, not plaintext
  });

  it('rejects a duplicate email with ConflictException', async () => {
    prisma.user.create.mockRejectedValue(uniqueConstraintError());

    await expect(service.register({ email: 'a@b.com', password: 'password123' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('rethrows non-uniqueness errors as-is', async () => {
    prisma.user.create.mockRejectedValue(new Error('db is down'));

    await expect(service.register({ email: 'a@b.com', password: 'password123' })).rejects.toThrow('db is down');
  });
});

describe('AuthService.login', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed-jwt') } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('rejects wrong password with UnauthorizedException', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: await bcrypt.hash('real-pw', 10) });
    await expect(service.login({ email: 'a@b.com', password: 'wrong-pw' })).rejects.toThrow(UnauthorizedException);
  });

  it('issues a token for correct password', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: await bcrypt.hash('real-pw', 10) });
    const result = await service.login({ email: 'a@b.com', password: 'real-pw' });
    expect(result.token).toBeDefined();
  });
});

describe('AuthService.findOrCreateSocialUser', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('creates a new user on first social login', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u2', email: 'social@example.com' });

    const user = await service.findOrCreateSocialUser('KAKAO', 'kakao-123', 'social@example.com');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'KAKAO', providerId: 'kakao-123' }),
    });
    expect(user.id).toBe('u2');
  });

  it('returns the existing user on repeat social login', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'social@example.com' });
    const user = await service.findOrCreateSocialUser('KAKAO', 'kakao-123', 'social@example.com');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(user.id).toBe('u2');
  });
});
