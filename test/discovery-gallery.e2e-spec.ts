import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const EMAIL = 'discovery-gallery-test@example.com';

describe('GET /discovery/gallery', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    // Like.photoId가 Photo를 참조하는 FK라서, 좋아요를 먼저 지워야
    // photo.deleteMany가 제약 위반 없이 끝난다 ('sorts by likes' 테스트가 Like를 만듦).
    await prisma.like.deleteMany({ where: { userId } });
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await app.close();
  });

  // discovery API는 유저 범위 없는 전역 조회라서, 'ILCE-7M4'/'X100VI'처럼 다른
  // e2e 파일에서도 흔히 쓰는 카메라명을 쓰면 병렬로 뜬 다른 파일의 데이터와 섞여
  // 정확한 배열 비교가 깨질 수 있다(discovery-map-controller.e2e-spec.ts에서 실제로
  // 겪음) — 이 파일 전용으로만 쓰는 고유한 카메라명을 쓴다.

  it('returns photos regardless of visibility (including HIDDEN), newest first by default', async () => {
    const camera = 'gallery-visibility-test-camera';
    const hidden = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'HIDDEN', cameraName: camera } });
    await new Promise((r) => setTimeout(r, 10));
    const visible = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'EXACT', cameraName: camera } });

    const res = await request(app.getHttpServer()).get('/discovery/gallery').query({ cameraName: camera }).expect(200);

    const ids = res.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual([visible.id, hidden.id]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('sorts by likes when sort=likes', async () => {
    const camera = 'gallery-likes-test-camera';
    const liked = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } });
    const unliked = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } });
    await prisma.like.create({ data: { userId, photoId: liked.id } });

    const res = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ cameraName: camera, sort: 'likes' })
      .expect(200);

    expect(res.body.items[0].id).toBe(liked.id);
    expect(res.body.items[0].likeCount).toBe(1);
    expect(res.body.items[1].id).toBe(unliked.id);
  });

  it('paginates with a cursor and ends with nextCursor: null', async () => {
    const camera = 'gallery-cursor-test-camera';
    for (let i = 0; i < 3; i++) {
      await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } });
      await new Promise((r) => setTimeout(r, 10));
    }

    const page1 = await request(app.getHttpServer()).get('/discovery/gallery').query({ cameraName: camera, limit: '2' }).expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ cameraName: camera, limit: '2', cursor: page1.body.nextCursor })
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    const overlap = page1.body.items.some((a: { id: string }) => page2.body.items.some((b: { id: string }) => a.id === b.id));
    expect(overlap).toBe(false);
  });

  it('ignores an unexpected region/bbox-like param instead of using it to filter (whitelist strip)', async () => {
    const camera = 'gallery-whitelist-test-camera';
    // 위치가 전혀 없는(location: null) 사진 — bbox가 실제로 필터로 쓰인다면 당연히
    // 빠져야 한다. "그래도 결과에 들어있다"로 bbox가 전혀 영향을 안 준다는 걸
    // 직접 증명한다 (리뷰 발견: 기존 테스트는 200 + 배열 타입만 봐서 실제로는
    // 아무것도 증명하지 못했음).
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } });

    const res = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ cameraName: camera, minLat: '37', maxLat: '38', minLng: '127', maxLng: '128' })
      .expect(200);

    expect(res.body.items.find((item: { id: string }) => item.id === photo.id)).toBeDefined();
  });

  it('returns an empty array when nothing matches', async () => {
    const res = await request(app.getHttpServer()).get('/discovery/gallery').query({ cameraName: 'NoSuchCamera' }).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('rejects a non-positive-integer limit with 400', async () => {
    await request(app.getHttpServer()).get('/discovery/gallery').query({ limit: '0' }).expect(400);
    await request(app.getHttpServer()).get('/discovery/gallery').query({ limit: '-1' }).expect(400);
    await request(app.getHttpServer()).get('/discovery/gallery').query({ limit: '1.5' }).expect(400);
  });

  it('clamps an excessively large limit instead of crashing or returning everything unbounded', async () => {
    const camera = 'gallery-limit-clamp-test-camera';
    for (let i = 0; i < 3; i++) {
      await prisma.photo.create({ data: { userId, originalKey: 'k', cameraName: camera } });
    }

    const res = await request(app.getHttpServer())
      .get('/discovery/gallery')
      .query({ cameraName: camera, limit: '999999' })
      .expect(200);

    expect(res.body.items).toHaveLength(3);
  });
});
