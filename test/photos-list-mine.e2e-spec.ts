import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const OWNER_EMAIL = 'photos-list-mine-owner@example.com';
const OTHER_EMAIL = 'photos-list-mine-other@example.com';
const OWNER_CAMERA = 'ListMineOwnerCam';
const OTHER_CAMERA = 'ListMineOtherCam';

describe('GET /photos/me', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let otherId: string;
  let activeId: string;
  let hiddenId: string;
  let deletedId: string;

  async function loginAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: 'password123' });
    return agent;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const authService = moduleRef.get(AuthService);
    const owner = await authService.register({ email: OWNER_EMAIL, password: 'password123' });
    const other = await authService.register({ email: OTHER_EMAIL, password: 'password123' });
    ownerId = owner.id;
    otherId = other.id;

    const active = await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'list-mine-active-k', cameraName: OWNER_CAMERA, status: 'ACTIVE' },
    });
    activeId = active.id;

    const hidden = await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'list-mine-hidden-k', cameraName: OWNER_CAMERA, status: 'HIDDEN' },
    });
    hiddenId = hidden.id;

    const deleted = await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'list-mine-deleted-k', cameraName: OWNER_CAMERA, status: 'DELETED' },
    });
    deletedId = deleted.id;

    await prisma.photo.create({
      data: { userId: otherId, originalKey: 'list-mine-other-k', cameraName: OTHER_CAMERA, status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: { in: [ownerId, otherId] } } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).get('/photos/me').expect(401);
  });

  it('returns only the logged-in user\'s own ACTIVE/HIDDEN photos, excluding DELETED and other users\'', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    const res = await agent.get('/photos/me?limit=50').expect(200);

    const ids = res.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(hiddenId);
    expect(ids).not.toContain(deletedId);
    expect(res.body.items.every((item: { cameraName: string }) => item.cameraName === OWNER_CAMERA)).toBe(true);
  });

  it('rejects a non-positive-integer limit with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.get('/photos/me?limit=0').expect(400);
  });
});
