import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('Prisma schema', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'schema-test@example.com' } });
    await prisma.$disconnect();
  });

  it('creates and reads back a user', async () => {
    const user = await prisma.user.create({
      data: { email: 'schema-test@example.com', passwordHash: 'x' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('schema-test@example.com');
  });
});
