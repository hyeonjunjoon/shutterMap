import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';

const OWNER_EMAIL = 'photos-delete-owner@example.com';
const OTHER_EMAIL = 'photos-delete-other@example.com';

describe('DELETE /photos/:id', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let photoLocationService: PhotoLocationService;
  let ownerId: string;
  let photoId: string;

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
    photoLocationService = moduleRef.get(PhotoLocationService);

    const authService = moduleRef.get(AuthService);
    const owner = await authService.register({ email: OWNER_EMAIL, password: 'password123' });
    await authService.register({ email: OTHER_EMAIL, password: 'password123' });
    ownerId = owner.id;

    const photo = await prisma.photo.create({ data: { userId: ownerId, originalKey: 'photos-delete-k' } });
    photoId = photo.id;
    await photoLocationService.setLocation(photoId, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).delete(`/photos/${photoId}`).expect(401);
  });

  it('rejects a non-owner with 403', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    await agent.delete(`/photos/${photoId}`).expect(403);
  });

  it('returns 404 for a photo that does not exist', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.delete('/photos/non-existent-id').expect(404);
  });

  it('soft-deletes the photo: status becomes DELETED, no row/file removed', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.delete(`/photos/${photoId}`).expect(200);

    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.status).toBe('DELETED');
  });

  it('a deleted photo 404s on detail and disappears from the gallery', async () => {
    await request(app.getHttpServer()).get(`/photos/${photoId}`).expect(404);

    const res = await request(app.getHttpServer()).get('/discovery/gallery?limit=50').expect(200);
    expect(res.body.items.find((item: { id: string }) => item.id === photoId)).toBeUndefined();
  });
});
