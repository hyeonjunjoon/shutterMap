import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService.register', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('creates a user with a hashed password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    const result = await service.register({ email: 'a@b.com', password: 'password123' });

    expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.passwordHash).not.toBe('password123'); // hashed, not plaintext
  });

  it('rejects a duplicate email with ConflictException', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.register({ email: 'a@b.com', password: 'password123' })).rejects.toThrow(
      ConflictException,
    );
  });
});
