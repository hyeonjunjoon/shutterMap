import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const CAMERA_A = 'EquipmentListCamA';
const CAMERA_B = 'EquipmentListCamB';
const LENS_A = 'EquipmentListLensA';
const OWNER_EMAIL = 'discovery-equipment-owner@example.com';

describe('GET /discovery/equipment', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let hiddenPhotoCamera: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const authService = moduleRef.get(AuthService);
    const owner = await authService.register({ email: OWNER_EMAIL, password: 'password123' });
    ownerId = owner.id;

    await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'eq-a', cameraName: CAMERA_A, lensName: LENS_A, status: 'ACTIVE' },
    });
    await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'eq-a2', cameraName: CAMERA_A, status: 'ACTIVE' }, // 중복 이름 — distinct 확인용
    });
    await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'eq-b', cameraName: CAMERA_B, status: 'ACTIVE' },
    });
    hiddenPhotoCamera = 'EquipmentListHiddenOnlyCam';
    await prisma.photo.create({
      data: { userId: ownerId, originalKey: 'eq-hidden', cameraName: hiddenPhotoCamera, status: 'HIDDEN' },
    });
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns distinct camera/lens names from ACTIVE photos only (no auth required)', async () => {
    const res = await request(app.getHttpServer()).get('/discovery/equipment').expect(200);

    expect(res.body.cameraNames).toContain(CAMERA_A);
    expect(res.body.cameraNames).toContain(CAMERA_B);
    expect(res.body.cameraNames.filter((name: string) => name === CAMERA_A)).toHaveLength(1); // distinct
    expect(res.body.lensNames).toContain(LENS_A);
  });

  it('excludes equipment names that only appear on non-ACTIVE (HIDDEN/DELETED) photos', async () => {
    const res = await request(app.getHttpServer()).get('/discovery/equipment').expect(200);

    expect(res.body.cameraNames).not.toContain(hiddenPhotoCamera);
  });
});
