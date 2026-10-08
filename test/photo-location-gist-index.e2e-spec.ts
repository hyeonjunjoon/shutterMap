import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Photo location 공간 부분 인덱스', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('photo_location_gist_idx가 GIST + 부분 조건으로 존재한다', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'photo_location_gist_idx'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('USING gist');
    expect(rows[0].indexdef).toContain("visibility <> 'HIDDEN'");
    expect(rows[0].indexdef).toContain("status = 'ACTIVE'");
  });
});
