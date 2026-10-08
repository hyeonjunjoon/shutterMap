import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { R2StorageService } from '../src/photos/services/r2-storage.service';
import { buildExifJpeg, buildPlainJpeg } from './fixtures/build-exif-jpeg';

const TEST_EMAIL = 'photos-upload-test@example.com';

describe('POST /photos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(R2StorageService)
      .useValue({
        uploadBuffer: jest.fn().mockResolvedValue(undefined),
        uploadOriginal: jest.fn().mockResolvedValue(undefined),
        buildPublicUrl: (k: string) => `https://cdn.test/${k}`,
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const authService = moduleRef.get(AuthService);
    const user = await authService.register({ email: TEST_EMAIL, password: 'password123' });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  function agentWithSession() {
    const agent = request.agent(app.getHttpServer());
    return agent;
  }

  it('rejects an unauthenticated upload with 401', async () => {
    const buffer = await buildPlainJpeg();
    await request(app.getHttpServer())
      .post('/photos')
      .attach('files', buffer, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('uploads a jpeg with gps exif and creates a photo with location', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    const buffer = await buildExifJpeg({ model: 'ILCE-7M4', gpsLat: 37, gpsLng: 127 });

    const res = await agent
      .post('/photos')
      .attach('files', buffer, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body).toEqual([
      { id: expect.any(String), cameraRaw: 'ILCE-7M4', lensRaw: null, hasLocation: true },
    ]);

    const saved = await prisma.photo.findUniqueOrThrow({ where: { id: res.body[0].id } });
    expect(saved.cameraRaw).toBe('ILCE-7M4');
    expect(saved.locationSource).toBe('EXIF');
  });

  it('uploads an exif-less image (screenshot) successfully with null fields', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    const buffer = await buildPlainJpeg();

    const res = await agent
      .post('/photos')
      .attach('files', buffer, { filename: 'shot.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body[0]).toEqual({ id: expect.any(String), cameraRaw: null, lensRaw: null, hasLocation: false });
  });

  it('rejects an empty upload (no files) with 400', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    await agent.post('/photos').expect(400);
  });

  it('rejects more than 10 files with 400 and persists nothing new', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    const countBefore = await prisma.photo.count({ where: { userId } });

    const buffer = await buildPlainJpeg();
    let req = agent.post('/photos');
    for (let i = 0; i < 11; i++) {
      req = req.attach('files', buffer, { filename: `${i}.jpg`, contentType: 'image/jpeg' });
    }
    await req.expect(400);

    const countAfter = await prisma.photo.count({ where: { userId } });
    expect(countAfter).toBe(countBefore);
  });

  it('rejects an unsupported mimetype with 415', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    await agent
      .post('/photos')
      .attach('files', Buffer.from('not an image'), { filename: 'a.gif', contentType: 'image/gif' })
      .expect(415);
  });

  it('rejects a file larger than 25MB with 413', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    const tooBig = Buffer.alloc(25 * 1024 * 1024 + 1, 1);
    await agent
      .post('/photos')
      .attach('files', tooBig, { filename: 'big.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });
});
