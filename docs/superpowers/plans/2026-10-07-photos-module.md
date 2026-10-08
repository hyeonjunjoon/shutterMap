# Photos 모듈 (업로드/위치/공개범위/상세) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRD 기능 1(업로드+EXIF), 2(수동 위치), 3(공개범위/fuzzy), 5(상세)를 `PhotosModule`로 구현한다 — 사진 업로드 시 EXIF를 파싱하고 이미지를 가공해 R2에 저장, GPS 유무에 따라 위치를 다루고, 공개범위(exact/fuzzy/hidden)에 따라 노출 좌표를 다르게 계산하는 API를 제공한다.

**Architecture:** 하나의 `Photo` 엔티티를 책임별 서비스로 쪼갠다 — `ExifService`(파싱), `ImageProcessingService`(HEIC 변환/리사이즈/썸네일, 메타데이터 제거), `R2StorageService`(업로드/퍼블릭 URL), `PhotoLocationService`(위치 읽기/쓰기, PostGIS raw SQL), `PhotoVisibilityService`(공개범위 전환 + fuzzy 오프셋 1회 생성 + 공개 좌표 투영), `PhotoUploadService`(위 서비스들을 조합해 업로드 플로우 오케스트레이션), `PhotosService`(상세 조회). 컨트롤러는 이 서비스들을 호출하는 thin 레이어.

**Tech Stack:** NestJS 11, Prisma 7 + PostGIS(raw SQL), exifr(EXIF 파싱), sharp(리사이즈/메타데이터 제거), heic-convert(HEIC→JPEG 디코딩), @aws-sdk/client-s3(R2 업로드), multer(`@nestjs/platform-express`의 `FilesInterceptor`, 이미 11.2.7에 포함됨).

**Spec:** [docs/PRD.md](../../PRD.md) — 기능 1(174행), 기능 2(224행), 기능 3(257행), 기능 5(346행), 5-1 모듈 경계(119행), 부록 A(543행)

## 사전 준비 (사용자가 Task 1 전에 해야 함)

`.env`에 아래 5개 변수를 추가한다. 실제 R2 자격증명이 아직 없다면 임의의 문자열이어도 된다 — e2e 테스트는 `R2StorageService`를 스텁으로 교체해서 돌리므로 실제 네트워크 호출은 발생하지 않지만, `requireEnv()`가 부팅 시점에 값 존재 자체는 확인하기 때문에 비어 있으면 앱 자체가 뜨지 않는다.

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_BASE_URL=
```

## Global Constraints

- `@nestjs/*` 계열은 전부 11.x로 고정한다 (CLAUDE.md).
- 환경변수는 `requireEnv()`로만 읽는다, `?? '기본값'` 폴백 금지 ([jwt-secret-hardcoded-fallback.md](../../solutions/security-issues/jwt-secret-hardcoded-fallback.md)). `requireEnv`는 Auth 전용이 아니므로 Task 1에서 `src/auth/require-env.ts` → `src/common/require-env.ts`로 옮긴다.
- 새 패키지 설치 전 `npm view <pkg> dist-tags`로 안정판 확인 (CLAUDE.md) — 이미 확인 완료, 아래 "설치할 패키지"에 정확한 버전 명시.
- 파일당 최대 25MB, 1회 최대 10장, 지원 포맷 JPEG/PNG/HEIC(HEIF 포함) (PRD 기능1, 부록A).
- fuzzy 오프셋은 반경 500m, 해당 사진이 **최초로 FUZZY가 되는 시점에 1회만 생성**하고 이후 재사용(재생성 금지), 서버(`PhotoVisibilityService`)에서만 계산 (PRD 기능3, 부록A). 동시 요청에서도 1회만 생성되도록 원자적 `UPDATE ... WHERE "fuzzyOffsetLat" IS NULL` 패턴을 쓴다 — find-or-create 레이스를 사전 체크 대신 조건부 쓰기+에러/영향행 0으로 처리한 [toctou-race-conditions.md](../../solutions/security-issues/toctou-race-conditions.md)와 같은 원리를 UPDATE에 적용한 것.
- **이름 혼동 주의:** `PhotoVisibility` enum의 `HIDDEN`(지도 미노출, 위치 공개범위)과 `PhotoStatus` enum의 `HIDDEN`(운영자 조치로 전체 비노출)은 완전히 다른 개념이다. 코드에서는 항상 `photo.visibility === 'HIDDEN'` / `photo.status === 'HIDDEN'`처럼 필드명으로 구분되지만, 리뷰 시 이름만 보고 혼동하기 쉽다.
- PostGIS `location` 컬럼은 Prisma Client로 못 읽고/못 씀 — 전부 `$queryRaw`/`$executeRaw`로 처리 (schema.prisma 주석 참고). `ST_MakePoint(lng, lat)` 순서(경도 먼저) 지키기.
- 이 플랜은 백엔드 API만 다룬다. PRD의 "위치 입력 없이는 다음 단계로 진행 불가"(건너뛰기 금지)는 프론트엔드 UX 책임으로 남긴다 — API는 `location`이 `null`인 Photo 생성을 허용하고, 지도/갤러리 노출 필터링(Discovery 모듈, 다음 플랜)에서 자연히 제외된다. **Ruling.**
- 장비명 정규화(기능 8, 사용자가 확정한 `cameraName`/`lensName` 수정 API)는 이 플랜에 포함하지 않는다 — 갤러리 자동완성은 Discovery 모듈의 몫. 지금은 업로드 시 EXIF 원문과 동일하게 채운다. **Ruling.**
- HEIC/HEIF 디코딩은 `sharp`가 아니라 `heic-convert`로 한다. 이 환경의 sharp(0.35.5, libheif 1.23.5)는 `heif()` 인코딩에서 `av1`(AVIF)만 지원하고 `hevc`(실제 아이폰 HEIC 코덱)는 "Unsupported compression"으로 실패한다 — 즉 sharp는 이 빌드에서 실제 HEIC를 디코딩하지 못할 가능성이 높다(직접 스파이크로 확인, `/tmp` 스크립트). `heic-convert`는 HEVC 디코딩을 위해 만들어진 라이브러리라 이걸 1차 경로로 쓴다.
- sharp는 기본적으로 재인코딩 시 모든 메타데이터(EXIF/GPS 포함)를 버린다(`withMetadata()`를 호출하지 않으면) — 직접 스파이크로 확인됨. 서빙/썸네일 이미지의 GPS 제거(기능1 특이사항)는 별도 로직 없이 이 기본 동작으로 충족된다.

## 설치할 패키지 (버전 확인 완료: `npm view <pkg> dist-tags.latest`)

```bash
npm install exifr@7.1.3 sharp@0.35.5 heic-convert@2.1.0 @aws-sdk/client-s3@3.1147.0
npm install -D @types/multer@2.3.0 piexifjs@1.0.6 @types/piexifjs@1.0.0
```

(`multer` 자체는 `@nestjs/platform-express@11.2.7`가 이미 `multer@2.4.0`을 전이 의존성으로 가지고 있어 별도 설치 불필요 — `FilesInterceptor`는 메모리 스토리지를 기본으로 쓰므로 `multer`를 직접 import할 일도 없다. 타입만 `@types/multer`로 보강.)

## Review Focus

- EXIF가 전혀 없는 이미지(스크린샷 등) 업로드 시 모든 필드가 `null`로 채워지고 업로드 자체는 성공해야 한다 — exifr이 던지는 게 아니라 `undefined`를 반환하는 것까지 직접 스파이크로 확인함 (Task 2, Task 5).
- `location`이 아예 없는 사진(수동 위치 등록 전)에 대해 공개 좌표 투영 함수가 null-safe해야 한다 — 터지면 안 되고 `null`을 반환해야 한다 (Task 4).
- 배치 업로드 중 파일 하나라도 형식/용량/개수 위반이면 요청 전체가 거부되고 부분 성공이 없어야 한다. multer/NestJS 11의 기본 동작(개수 초과 400, 용량 초과 413, `fileFilter`에서 던진 `UnsupportedMediaTypeException` 415)이 이미 이 요구를 충족하는지 직접 스파이크로 확인함 — 새 예외 필터를 만들 필요 없음 (Task 7).
- fuzzy 오프셋은 동시 요청에서도 1회만 생성되고, 한 번 생성된 뒤에는 `EXACT`→`FUZZY`→`EXACT`→`FUZZY`처럼 왔다갔다해도 재생성되지 않아야 한다 (Task 4).
- 소유자가 아닌 사용자가 다른 사람 사진의 위치/공개범위를 변경하려 하면 403이어야 한다 (Task 4, Task 8, Task 9).

---

### Task 1: `requireEnv` 공용화 + `R2StorageService`

**Files:**
- Modify: `src/auth/require-env.ts` → `src/common/require-env.ts` (이동)
- Modify: `src/auth/require-env.spec.ts` → `src/common/require-env.spec.ts` (이동)
- Modify: `src/auth/jwt-secret.ts:1` (import 경로 수정)
- Modify: `src/auth/strategies/kakao.strategy.ts:1` (import 경로 수정)
- Modify: `src/auth/strategies/google.strategy.ts:1` (import 경로 수정)
- Create: `src/photos/services/r2-storage.service.ts`
- Test: `src/photos/services/r2-storage.service.spec.ts`

**Interfaces:**
- Produces: `requireEnv(name: string): string` (경로만 이동, 시그니처 동일). `R2StorageService.uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void>`, `R2StorageService.buildPublicUrl(key: string): string`. `S3_CLIENT` DI 토큰, `createR2Client(): S3Client` 팩토리.

- [ ] **Step 1: `require-env`를 `src/common/`으로 이동 (리팩터, 새 테스트 없음)**

```bash
mkdir -p src/common
git mv src/auth/require-env.ts src/common/require-env.ts
git mv src/auth/require-env.spec.ts src/common/require-env.spec.ts
```

`src/common/require-env.spec.ts`의 import 경로는 같은 디렉토리 상대경로라 내용 변경 없음.

- [ ] **Step 2: 의존하던 파일들의 import 경로 수정**

`src/auth/jwt-secret.ts`:
```ts
import { requireEnv } from '../common/require-env';
```

`src/auth/strategies/kakao.strategy.ts`, `src/auth/strategies/google.strategy.ts` 상단의:
```ts
import { requireEnv } from '../require-env';
```
를
```ts
import { requireEnv } from '../../common/require-env';
```
로 수정.

- [ ] **Step 3: 전체 테스트로 이동이 안전했는지 확인**

Run: `npm test && npm run test:e2e && npm run typecheck`
Expected: 전부 기존과 동일하게 PASS (새 동작 추가 없음, 순수 이동).

- [ ] **Step 4: 패키지 설치**

```bash
npm install exifr@7.1.3 sharp@0.35.5 heic-convert@2.1.0 @aws-sdk/client-s3@3.1147.0
npm install -D @types/multer@2.3.0 piexifjs@1.0.6 @types/piexifjs@1.0.0
```

- [ ] **Step 5: 실패하는 테스트 작성 — `R2StorageService.uploadBuffer`가 올바른 키/버킷/본문으로 PutObject를 호출한다**

`src/photos/services/r2-storage.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { R2StorageService, S3_CLIENT } from './r2-storage.service';

describe('R2StorageService', () => {
  let service: R2StorageService;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.com';
    client = { send: jest.fn().mockResolvedValue({}) };
    const moduleRef = await Test.createTestingModule({
      providers: [R2StorageService, { provide: S3_CLIENT, useValue: client }],
    }).compile();
    service = moduleRef.get(R2StorageService);
  });

  it('uploads the buffer with the given key, bucket, and content type', async () => {
    await service.uploadBuffer('photos/u1/p1/original.jpg', Buffer.from('abc'), 'image/jpeg');

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'photos/u1/p1/original.jpg',
      Body: Buffer.from('abc'),
      ContentType: 'image/jpeg',
    });
  });

  it('builds a public url by joining the base url and key', () => {
    expect(service.buildPublicUrl('photos/u1/p1/thumbnail.jpg')).toBe(
      'https://cdn.example.com/photos/u1/p1/thumbnail.jpg',
    );
  });
});
```

- [ ] **Step 6: 테스트 실행 → 실패 확인**

Run: `npm test -- r2-storage.service.spec.ts`
Expected: FAIL — `Cannot find module './r2-storage.service'`

- [ ] **Step 7: 최소 구현**

`src/photos/services/r2-storage.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from '../../common/require-env';

export const S3_CLIENT = 'S3_CLIENT';

export function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

@Injectable()
export class R2StorageService {
  private readonly bucket = requireEnv('R2_BUCKET_NAME');
  private readonly publicBaseUrl = requireEnv('R2_PUBLIC_BASE_URL');

  constructor(@Inject(S3_CLIENT) private readonly client: S3Client) {}

  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  buildPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
```

- [ ] **Step 8: 테스트 실행 → 통과 확인**

Run: `npm test -- r2-storage.service.spec.ts`
Expected: PASS 2/2

- [ ] **Step 9: 커밋**

```bash
git add src/common src/auth/jwt-secret.ts src/auth/strategies/kakao.strategy.ts src/auth/strategies/google.strategy.ts src/photos package.json package-lock.json
git commit -m "feat: requireEnv 공용화 + R2StorageService 추가"
```

---

### Task 2: `ExifService`

**Files:**
- Create: `src/photos/services/exif.service.ts`
- Create: `test/fixtures/build-exif-jpeg.ts` (여러 태스크에서 재사용하는 테스트 픽스처 빌더)
- Test: `src/photos/services/exif.service.spec.ts`

**Interfaces:**
- Produces: `ExifService.parse(buffer: Buffer): Promise<ParsedExif>` where
  `ParsedExif = { cameraRaw: string | null; lensRaw: string | null; focalLength: number | null; aperture: number | null; shutterSpeed: string | null; iso: number | null; takenAt: Date | null; gps: { lat: number; lng: number } | null }`.
  `buildExifJpeg(options): Promise<Buffer>`, `buildPlainJpeg(): Promise<Buffer>` (피xture 빌더, Task 5/6/7에서도 사용).

- [ ] **Step 1: 테스트 픽스처 빌더 작성 (실제 EXIF가 박힌 JPEG를 런타임에 생성, 바이너리 파일 커밋 안 함)**

`test/fixtures/build-exif-jpeg.ts`:
```ts
import piexif from 'piexifjs';
import sharp from 'sharp';

export interface ExifFixtureOptions {
  make?: string;
  model?: string;
  lensModel?: string;
  focalLengthMm?: number;
  fNumber?: number;
  exposureTimeSeconds?: number;
  iso?: number;
  dateTimeOriginal?: string; // 'YYYY:MM:DD HH:mm:ss'
  gpsLat?: number; // 정수 도 단위로만 쓸 것 (DMS 반올림 오차 회피)
  gpsLng?: number;
}

function toDmsRational(decimalDegrees: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(decimalDegrees);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  return [[degrees, 1], [minutes, 1], [Math.round(seconds * 100), 100]];
}

export async function buildExifJpeg(options: ExifFixtureOptions): Promise<Buffer> {
  const baseJpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();

  const zeroth: Record<number, unknown> = {};
  if (options.model) zeroth[piexif.ImageIFD.Model] = options.model;
  if (options.make) zeroth[piexif.ImageIFD.Make] = options.make;

  const exifIfd: Record<number, unknown> = {};
  if (options.lensModel) exifIfd[piexif.ExifIFD.LensModel] = options.lensModel;
  if (options.focalLengthMm != null) exifIfd[piexif.ExifIFD.FocalLength] = [options.focalLengthMm * 10, 10];
  if (options.fNumber != null) exifIfd[piexif.ExifIFD.FNumber] = [options.fNumber * 10, 10];
  if (options.exposureTimeSeconds != null) {
    exifIfd[piexif.ExifIFD.ExposureTime] =
      options.exposureTimeSeconds >= 1
        ? [options.exposureTimeSeconds, 1]
        : [1, Math.round(1 / options.exposureTimeSeconds)];
  }
  if (options.iso != null) exifIfd[piexif.ExifIFD.ISOSpeedRatings] = options.iso;
  if (options.dateTimeOriginal) exifIfd[piexif.ExifIFD.DateTimeOriginal] = options.dateTimeOriginal;

  const exifObj: Record<string, unknown> = { '0th': zeroth, Exif: exifIfd };

  if (options.gpsLat != null && options.gpsLng != null) {
    const gpsIfd: Record<number, unknown> = {};
    gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = options.gpsLat >= 0 ? 'N' : 'S';
    gpsIfd[piexif.GPSIFD.GPSLatitude] = toDmsRational(options.gpsLat);
    gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = options.gpsLng >= 0 ? 'E' : 'W';
    gpsIfd[piexif.GPSIFD.GPSLongitude] = toDmsRational(options.gpsLng);
    exifObj.GPS = gpsIfd;
  }

  const exifBytes = piexif.dump(exifObj);
  const inserted = piexif.insert(exifBytes, baseJpeg.toString('binary'));
  return Buffer.from(inserted, 'binary');
}

export async function buildPlainJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/photos/services/exif.service.spec.ts`:
```ts
import { ExifService } from './exif.service';
import { buildExifJpeg, buildPlainJpeg } from '../../../test/fixtures/build-exif-jpeg';

describe('ExifService.parse', () => {
  const service = new ExifService();

  it('extracts camera/lens/exposure fields and converts gps to decimal degrees', async () => {
    const buffer = await buildExifJpeg({
      make: 'SONY',
      model: 'ILCE-7M4',
      lensModel: 'FE 24-70mm F2.8 GM',
      focalLengthMm: 70,
      fNumber: 2.8,
      exposureTimeSeconds: 0.01,
      iso: 400,
      dateTimeOriginal: '2026:01:15 10:30:00',
      gpsLat: 37,
      gpsLng: 127,
    });

    const result = await service.parse(buffer);

    expect(result.cameraRaw).toBe('ILCE-7M4');
    expect(result.lensRaw).toBe('FE 24-70mm F2.8 GM');
    expect(result.focalLength).toBe(70);
    expect(result.aperture).toBe(2.8);
    expect(result.shutterSpeed).toBe('1/100');
    expect(result.iso).toBe(400);
    expect(result.takenAt?.toISOString()).toBe('2026-01-15T01:30:00.000Z');
    expect(result.gps).toEqual({ lat: 37, lng: 127 });
  });

  it('returns all-null fields for an image with no EXIF at all (e.g. a screenshot)', async () => {
    const buffer = await buildPlainJpeg();

    const result = await service.parse(buffer);

    expect(result).toEqual({
      cameraRaw: null,
      lensRaw: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      iso: null,
      takenAt: null,
      gps: null,
    });
  });

  it('returns gps: null when the photo has exif but no gps data', async () => {
    const buffer = await buildExifJpeg({ model: 'X100VI' });

    const result = await service.parse(buffer);

    expect(result.cameraRaw).toBe('X100VI');
    expect(result.gps).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npm test -- exif.service.spec.ts`
Expected: FAIL — `Cannot find module './exif.service'`

- [ ] **Step 4: 최소 구현**

`src/photos/services/exif.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import exifr from 'exifr';

export interface ParsedExif {
  cameraRaw: string | null;
  lensRaw: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  takenAt: Date | null;
  gps: { lat: number; lng: number } | null;
}

function formatShutterSpeed(exposureTimeSeconds: number | undefined): string | null {
  if (exposureTimeSeconds == null) return null;
  if (exposureTimeSeconds >= 1) return `${exposureTimeSeconds}s`;
  return `1/${Math.round(1 / exposureTimeSeconds)}`;
}

interface ExifrTags {
  Model?: string;
  LensModel?: string;
  FocalLength?: number;
  FNumber?: number;
  ExposureTime?: number;
  ISO?: number;
  DateTimeOriginal?: Date;
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class ExifService {
  async parse(buffer: Buffer): Promise<ParsedExif> {
    const tags: ExifrTags | undefined = await exifr
      .parse(buffer, { gps: true, tiff: true, exif: true })
      .catch(() => undefined);

    if (!tags) {
      return {
        cameraRaw: null,
        lensRaw: null,
        focalLength: null,
        aperture: null,
        shutterSpeed: null,
        iso: null,
        takenAt: null,
        gps: null,
      };
    }

    const gps =
      typeof tags.latitude === 'number' && typeof tags.longitude === 'number'
        ? { lat: tags.latitude, lng: tags.longitude }
        : null;

    return {
      cameraRaw: tags.Model ?? null,
      lensRaw: tags.LensModel ?? null,
      focalLength: tags.FocalLength ?? null,
      aperture: tags.FNumber ?? null,
      shutterSpeed: formatShutterSpeed(tags.ExposureTime),
      iso: tags.ISO ?? null,
      takenAt: tags.DateTimeOriginal ?? null,
      gps,
    };
  }
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npm test -- exif.service.spec.ts`
Expected: PASS 3/3

- [ ] **Step 6: 커밋**

```bash
git add src/photos/services/exif.service.ts src/photos/services/exif.service.spec.ts test/fixtures
git commit -m "feat: ExifService 추가 — EXIF/GPS 파싱"
```

---

### Task 3: `ImageProcessingService`

**Files:**
- Create: `src/photos/services/image-processing.service.ts`
- Test: `src/photos/services/image-processing.service.spec.ts`

**Interfaces:**
- Consumes: `buildExifJpeg`, `buildPlainJpeg` (Task 2).
- Produces: `ImageProcessingService.process(buffer: Buffer, mimetype: string): Promise<{ serving: Buffer; thumbnail: Buffer }>`.

- [ ] **Step 1: 실패하는 테스트 작성 — JPEG 경로는 실제로 메타데이터를 제거하고 썸네일을 리사이즈한다**

`src/photos/services/image-processing.service.spec.ts`:
```ts
import sharp from 'sharp';
import exifr from 'exifr';
import { ImageProcessingService } from './image-processing.service';
import { buildExifJpeg } from '../../../test/fixtures/build-exif-jpeg';

jest.mock('heic-convert', () => jest.fn());
import heicConvert from 'heic-convert';

describe('ImageProcessingService.process', () => {
  let service: ImageProcessingService;

  beforeEach(() => {
    service = new ImageProcessingService();
    jest.clearAllMocks();
  });

  it('strips exif/gps and resizes the thumbnail for a jpeg', async () => {
    const input = await buildExifJpeg({ model: 'ILCE-7M4', gpsLat: 37, gpsLng: 127 });

    const result = await service.process(input, 'image/jpeg');

    const servingTags = await exifr.parse(result.serving, { gps: true }).catch(() => undefined);
    expect(servingTags).toBeUndefined();

    const thumbMeta = await sharp(result.thumbnail).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(480);
    expect(thumbMeta.height).toBeLessThanOrEqual(480);
  });

  it('routes heic/heif files through heic-convert before processing', async () => {
    const plainJpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    (heicConvert as unknown as jest.Mock).mockResolvedValue(plainJpeg);

    const result = await service.process(Buffer.from('fake-heic-bytes'), 'image/heic');

    expect(heicConvert).toHaveBeenCalledWith({
      buffer: Buffer.from('fake-heic-bytes'),
      format: 'JPEG',
      quality: 1,
    });
    const meta = await sharp(result.serving).metadata();
    expect(meta.format).toBe('jpeg');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- image-processing.service.spec.ts`
Expected: FAIL — `Cannot find module './image-processing.service'`

- [ ] **Step 3: 최소 구현**

`src/photos/services/image-processing.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

export interface ProcessedImage {
  serving: Buffer;
  thumbnail: Buffer;
}

const HEIC_MIMETYPES = ['image/heic', 'image/heif'];
const THUMBNAIL_MAX_SIZE = 480;

@Injectable()
export class ImageProcessingService {
  async process(buffer: Buffer, mimetype: string): Promise<ProcessedImage> {
    const decodable = HEIC_MIMETYPES.includes(mimetype)
      ? Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 1 }))
      : buffer;

    const serving = await sharp(decodable).rotate().jpeg({ quality: 90 }).toBuffer();
    const thumbnail = await sharp(decodable)
      .rotate()
      .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return { serving, thumbnail };
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- image-processing.service.spec.ts`
Expected: PASS 2/2

- [ ] **Step 5: 커밋**

```bash
git add src/photos/services/image-processing.service.ts src/photos/services/image-processing.service.spec.ts
git commit -m "feat: ImageProcessingService 추가 — HEIC 변환/리사이즈/메타데이터 제거"
```

---

### Task 4: `PhotoLocationService` + `PhotoVisibilityService`

**Files:**
- Create: `src/photos/services/photo-location.service.ts`
- Create: `src/photos/services/photo-visibility.service.ts`
- Test: `test/photo-location-visibility.e2e-spec.ts` (PostGIS raw SQL을 실제로 검증해야 해서 실제 DB 대상 e2e — `test/prisma-schema.e2e-spec.ts`와 같은 패턴)

**Interfaces:**
- Produces:
  `PhotoLocationService.getCoordinates(photoId: string): Promise<{ lat: number; lng: number } | null>`
  `PhotoLocationService.setLocation(photoId: string, userId: string, coords: { lat: number; lng: number }, source: 'EXIF' | 'MANUAL'): Promise<void>` (소유자 아니면 `ForbiddenException`, 없으면 `NotFoundException`)
  `PhotoVisibilityService.ensureFuzzyOffset(photoId: string): Promise<void>` (location 없으면 그냥 반환, 있고 오프셋 없으면 생성, 있으면 아무것도 안 함 — 재생성 금지)
  `PhotoVisibilityService.setVisibility(photoId: string, userId: string, visibility: 'EXACT' | 'FUZZY' | 'HIDDEN'): Promise<void>` (소유자 체크 포함)
  `PhotoVisibilityService.toPublicLocation(photo: Photo): Promise<{ lat: number; lng: number } | null>`
- Consumes: `PrismaService` (`../../prisma/prisma.service`), `PhotoLocationService.getCoordinates` (같은 태스크 내부).

- [ ] **Step 1: 실패하는 테스트 작성 — 위치 읽기/쓰기, 소유권, fuzzy 1회 생성, null-safe 투영을 모두 실제 DB로 검증**

`test/photo-location-visibility.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';
import { PhotoVisibilityService } from '../src/photos/services/photo-visibility.service';

describe('PhotoLocationService + PhotoVisibilityService', () => {
  let prisma: PrismaService;
  let locationService: PhotoLocationService;
  let visibilityService: PhotoVisibilityService;
  let ownerId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PhotoLocationService, PhotoVisibilityService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    locationService = moduleRef.get(PhotoLocationService);
    visibilityService = moduleRef.get(PhotoVisibilityService);

    const owner = await prisma.user.create({ data: { email: 'photo-loc-owner@example.com', passwordHash: 'x' } });
    const other = await prisma.user.create({ data: { email: 'photo-loc-other@example.com', passwordHash: 'x' } });
    ownerId = owner.id;
    otherUserId = other.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: { in: [ownerId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherUserId] } } });
    await prisma.$disconnect();
  });

  async function createBarePhoto() {
    return prisma.photo.create({ data: { userId: ownerId, originalKey: 'k' } });
  }

  it('returns null coordinates for a photo with no location yet', async () => {
    const photo = await createBarePhoto();
    const coords = await locationService.getCoordinates(photo.id);
    expect(coords).toBeNull();
  });

  it('sets and reads back a location (longitude/latitude order correct)', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'MANUAL');

    const coords = await locationService.getCoordinates(photo.id);
    expect(coords?.lat).toBeCloseTo(37.5, 5);
    expect(coords?.lng).toBeCloseTo(127.0, 5);

    const updated = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(updated.locationSource).toBe('MANUAL');
  });

  it('rejects setLocation from a non-owner with 403', async () => {
    const photo = await createBarePhoto();
    await expect(
      locationService.setLocation(photo.id, otherUserId, { lat: 1, lng: 1 }, 'MANUAL'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('toPublicLocation returns null for a photo with no location (not yet set)', async () => {
    const photo = await createBarePhoto();
    const result = await visibilityService.toPublicLocation(photo);
    expect(result).toBeNull();
  });

  it('ensureFuzzyOffset does nothing when the photo has no location', async () => {
    const photo = await createBarePhoto();
    await visibilityService.ensureFuzzyOffset(photo.id);
    const reloaded = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(reloaded.fuzzyOffsetLat).toBeNull();
  });

  it('generates a fuzzy offset once and never regenerates it on repeated calls', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    await visibilityService.ensureFuzzyOffset(photo.id);
    const first = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(first.fuzzyOffsetLat).not.toBeNull();

    await visibilityService.ensureFuzzyOffset(photo.id);
    const second = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(second.fuzzyOffsetLat).toBe(first.fuzzyOffsetLat);
    expect(second.fuzzyOffsetLng).toBe(first.fuzzyOffsetLng);
  });

  it('setVisibility to FUZZY generates the offset, and EXACT reveals the real coordinates', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    await visibilityService.setVisibility(photo.id, ownerId, 'FUZZY');
    const fuzzyPhoto = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    const fuzzyLocation = await visibilityService.toPublicLocation(fuzzyPhoto);
    expect(fuzzyLocation).not.toBeNull();
    expect(fuzzyLocation).not.toEqual({ lat: 37.5, lng: 127.0 }); // 원본 그대로 노출되면 안 됨

    await visibilityService.setVisibility(photo.id, ownerId, 'EXACT');
    const exactPhoto = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    const exactLocation = await visibilityService.toPublicLocation(exactPhoto);
    expect(exactLocation?.lat).toBeCloseTo(37.5, 5);
    expect(exactLocation?.lng).toBeCloseTo(127.0, 5);
  });

  it('toPublicLocation returns null for HIDDEN visibility', async () => {
    const photo = await createBarePhoto();
    await locationService.setLocation(photo.id, ownerId, { lat: 37.5, lng: 127.0 }, 'EXIF');
    await visibilityService.setVisibility(photo.id, ownerId, 'HIDDEN');

    const hiddenPhoto = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(await visibilityService.toPublicLocation(hiddenPhoto)).toBeNull();
  });

  it('rejects setVisibility from a non-owner with 403', async () => {
    const photo = await createBarePhoto();
    await expect(
      visibilityService.setVisibility(photo.id, otherUserId, 'HIDDEN'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photo-location-visibility.e2e-spec.ts`
Expected: FAIL — `Cannot find module '../src/photos/services/photo-location.service'`

- [ ] **Step 3: `PhotoLocationService` 최소 구현**

`src/photos/services/photo-location.service.ts`:
```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Coordinates {
  lat: number;
  lng: number;
}

@Injectable()
export class PhotoLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoordinates(photoId: string): Promise<Coordinates | null> {
    const rows = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM "Photo" WHERE id = ${photoId} AND location IS NOT NULL
    `;
    return rows[0] ?? null;
  }

  async setLocation(
    photoId: string,
    userId: string,
    coords: Coordinates,
    source: LocationSource,
  ): Promise<void> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다.');
    if (photo.userId !== userId) throw new ForbiddenException('본인 사진만 수정할 수 있습니다.');

    await this.prisma.$executeRaw`
      UPDATE "Photo"
      SET location = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)::geography,
          "locationSource" = ${source}::"LocationSource"
      WHERE id = ${photoId}
    `;
  }
}
```

- [ ] **Step 4: `PhotoVisibilityService` 최소 구현**

`src/photos/services/photo-visibility.service.ts`:
```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Photo, PhotoVisibility } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhotoLocationService } from './photo-location.service';

const FUZZY_RADIUS_METERS = 500;
const METERS_PER_LAT_DEGREE = 111_320;

export interface PublicLocation {
  lat: number;
  lng: number;
}

function randomFuzzyOffset(lat: number, lng: number): PublicLocation {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.sqrt(Math.random()) * FUZZY_RADIUS_METERS; // 면적 기준 균등분포
  const deltaLat = (distance * Math.cos(angle)) / METERS_PER_LAT_DEGREE;
  const metersPerLngDegree = METERS_PER_LAT_DEGREE * Math.cos((lat * Math.PI) / 180);
  const deltaLng = (distance * Math.sin(angle)) / metersPerLngDegree;
  return { lat: lat + deltaLat, lng: lng + deltaLng };
}

@Injectable()
export class PhotoVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoLocationService: PhotoLocationService,
  ) {}

  async setVisibility(photoId: string, userId: string, visibility: PhotoVisibility): Promise<void> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('사진을 찾을 수 없습니다.');
    if (photo.userId !== userId) throw new ForbiddenException('본인 사진만 수정할 수 있습니다.');

    if (visibility === 'FUZZY') {
      await this.ensureFuzzyOffset(photoId);
    }
    await this.prisma.photo.update({ where: { id: photoId }, data: { visibility } });
  }

  // location이 있고 오프셋이 아직 없을 때만 1회 생성한다. 원자적 UPDATE ... WHERE
  // "fuzzyOffsetLat" IS NULL 덕분에, 동시에 두 번 호출돼도 한쪽만 실제로 값을 쓰고
  // 나머지는 영향받은 행이 0개라 조용히 넘어간다 — 재생성 없음.
  async ensureFuzzyOffset(photoId: string): Promise<void> {
    const origin = await this.photoLocationService.getCoordinates(photoId);
    if (!origin) return;

    const offset = randomFuzzyOffset(origin.lat, origin.lng);
    await this.prisma.$executeRaw`
      UPDATE "Photo"
      SET "fuzzyOffsetLat" = ${offset.lat}, "fuzzyOffsetLng" = ${offset.lng}
      WHERE id = ${photoId} AND "fuzzyOffsetLat" IS NULL
    `;
  }

  async toPublicLocation(photo: Photo): Promise<PublicLocation | null> {
    if (photo.visibility === 'HIDDEN') return null;
    if (photo.visibility === 'EXACT') {
      return this.photoLocationService.getCoordinates(photo.id);
    }
    if (photo.fuzzyOffsetLat == null || photo.fuzzyOffsetLng == null) return null;
    return { lat: photo.fuzzyOffsetLat, lng: photo.fuzzyOffsetLng };
  }
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photo-location-visibility.e2e-spec.ts`
Expected: PASS 9/9

- [ ] **Step 6: 커밋**

```bash
git add src/photos/services/photo-location.service.ts src/photos/services/photo-visibility.service.ts test/photo-location-visibility.e2e-spec.ts
git commit -m "feat: PhotoLocationService, PhotoVisibilityService 추가 — 위치/공개범위/fuzzy 오프셋"
```

---

### Task 5: `PhotoUploadService`

**Files:**
- Create: `src/photos/services/photo-upload.service.ts`
- Test: `src/photos/services/photo-upload.service.spec.ts`

**Interfaces:**
- Consumes: `ExifService.parse` (Task 2), `ImageProcessingService.process` (Task 3), `R2StorageService.uploadBuffer` (Task 1), `PhotoLocationService.setLocation` (Task 4), `PhotoVisibilityService.ensureFuzzyOffset` (Task 4), `PrismaService`.
- Produces: `PhotoUploadService.uploadPhotos(userId: string, files: Express.Multer.File[]): Promise<{ id: string; cameraRaw: string | null; lensRaw: string | null; hasLocation: boolean }[]>`.

- [ ] **Step 1: 실패하는 테스트 작성 — mock으로 각 협력 서비스 호출을 검증하고, 첫 업로드 시 보유 장비 자동 등록(PRD 기능1/3장 "보유 장비" 규칙)까지 확인**

`src/photos/services/photo-upload.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { PhotoUploadService } from './photo-upload.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExifService } from './exif.service';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { PhotoLocationService } from './photo-location.service';
import { PhotoVisibilityService } from './photo-visibility.service';

function fakeFile(mimetype: string): Express.Multer.File {
  return {
    buffer: Buffer.from('fake'),
    mimetype,
    originalname: 'a.jpg',
  } as Express.Multer.File;
}

describe('PhotoUploadService.uploadPhotos', () => {
  let service: PhotoUploadService;
  let prisma: {
    photo: { create: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let exifService: { parse: jest.Mock };
  let imageProcessingService: { process: jest.Mock };
  let r2: { uploadBuffer: jest.Mock };
  let photoLocationService: { setLocation: jest.Mock };
  let photoVisibilityService: { ensureFuzzyOffset: jest.Mock };

  beforeEach(async () => {
    prisma = {
      photo: { create: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ ownedCameraName: null }), update: jest.fn() },
    };
    exifService = {
      parse: jest.fn().mockResolvedValue({
        cameraRaw: 'ILCE-7M4',
        lensRaw: 'FE 24-70mm F2.8 GM',
        focalLength: 70,
        aperture: 2.8,
        shutterSpeed: '1/100',
        iso: 400,
        takenAt: new Date('2026-01-15T01:30:00.000Z'),
        gps: { lat: 37.5, lng: 127.0 },
      }),
    };
    imageProcessingService = {
      process: jest.fn().mockResolvedValue({ serving: Buffer.from('s'), thumbnail: Buffer.from('t') }),
    };
    r2 = { uploadBuffer: jest.fn().mockResolvedValue(undefined) };
    photoLocationService = { setLocation: jest.fn().mockResolvedValue(undefined) };
    photoVisibilityService = { ensureFuzzyOffset: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PhotoUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExifService, useValue: exifService },
        { provide: ImageProcessingService, useValue: imageProcessingService },
        { provide: R2StorageService, useValue: r2 },
        { provide: PhotoLocationService, useValue: photoLocationService },
        { provide: PhotoVisibilityService, useValue: photoVisibilityService },
      ],
    }).compile();
    service = moduleRef.get(PhotoUploadService);
  });

  it('uploads original/serving/thumbnail to R2 and creates a Photo row with parsed EXIF fields', async () => {
    const results = await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(r2.uploadBuffer).toHaveBeenCalledTimes(3);
    const createArgs = prisma.photo.create.mock.calls[0][0].data;
    expect(createArgs.userId).toBe('user-1');
    expect(createArgs.cameraRaw).toBe('ILCE-7M4');
    expect(createArgs.lensRaw).toBe('FE 24-70mm F2.8 GM');
    expect(results).toEqual([
      { id: expect.any(String), cameraRaw: 'ILCE-7M4', lensRaw: 'FE 24-70mm F2.8 GM', hasLocation: true },
    ]);
  });

  it('sets location and ensures a fuzzy offset when the exif has gps', async () => {
    await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(photoLocationService.setLocation).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      { lat: 37.5, lng: 127.0 },
      'EXIF',
    );
    expect(photoVisibilityService.ensureFuzzyOffset).toHaveBeenCalledTimes(1);
  });

  it('skips setLocation/ensureFuzzyOffset when the exif has no gps (screenshot case)', async () => {
    exifService.parse.mockResolvedValue({
      cameraRaw: null,
      lensRaw: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      iso: null,
      takenAt: null,
      gps: null,
    });

    const results = await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(photoLocationService.setLocation).not.toHaveBeenCalled();
    expect(photoVisibilityService.ensureFuzzyOffset).not.toHaveBeenCalled();
    expect(results[0].hasLocation).toBe(false);
  });

  it('sets the user ownedCameraName on first upload if not already set', async () => {
    await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { ownedCameraRaw: 'ILCE-7M4', ownedCameraName: 'ILCE-7M4' },
    });
  });

  it('does not overwrite ownedCameraName when the user already has one', async () => {
    prisma.user.findUnique.mockResolvedValue({ ownedCameraName: 'Sony A7 IV' });

    await service.uploadPhotos('user-1', [fakeFile('image/jpeg')]);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- photo-upload.service.spec.ts`
Expected: FAIL — `Cannot find module './photo-upload.service'`

- [ ] **Step 3: 최소 구현**

`src/photos/services/photo-upload.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ExifService } from './exif.service';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';
import { PhotoLocationService } from './photo-location.service';
import { PhotoVisibilityService } from './photo-visibility.service';

export interface UploadedPhotoResult {
  id: string;
  cameraRaw: string | null;
  lensRaw: string | null;
  hasLocation: boolean;
}

@Injectable()
export class PhotoUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exifService: ExifService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly r2: R2StorageService,
    private readonly photoLocationService: PhotoLocationService,
    private readonly photoVisibilityService: PhotoVisibilityService,
  ) {}

  async uploadPhotos(userId: string, files: Express.Multer.File[]): Promise<UploadedPhotoResult[]> {
    const results: UploadedPhotoResult[] = [];

    for (const file of files) {
      const id = randomUUID();
      const exif = await this.exifService.parse(file.buffer);
      const processed = await this.imageProcessingService.process(file.buffer, file.mimetype);

      const originalExt = file.mimetype === 'image/png' ? 'png' : 'jpg';
      const originalKey = `photos/${userId}/${id}/original.${originalExt}`;
      const servingKey = `photos/${userId}/${id}/serving.jpg`;
      const thumbnailKey = `photos/${userId}/${id}/thumbnail.jpg`;

      await this.r2.uploadBuffer(originalKey, file.buffer, file.mimetype);
      await this.r2.uploadBuffer(servingKey, processed.serving, 'image/jpeg');
      await this.r2.uploadBuffer(thumbnailKey, processed.thumbnail, 'image/jpeg');

      await this.prisma.photo.create({
        data: {
          id,
          userId,
          originalKey,
          servingKey,
          thumbnailKey,
          cameraRaw: exif.cameraRaw,
          cameraName: exif.cameraRaw,
          lensRaw: exif.lensRaw,
          lensName: exif.lensRaw,
          focalLength: exif.focalLength,
          aperture: exif.aperture,
          shutterSpeed: exif.shutterSpeed,
          iso: exif.iso,
          takenAt: exif.takenAt,
        },
      });

      if (exif.gps) {
        await this.photoLocationService.setLocation(id, userId, exif.gps, 'EXIF');
        await this.photoVisibilityService.ensureFuzzyOffset(id);
      }

      await this.maybeSetOwnedCamera(userId, exif.cameraRaw);

      results.push({ id, cameraRaw: exif.cameraRaw, lensRaw: exif.lensRaw, hasLocation: exif.gps != null });
    }

    return results;
  }

  private async maybeSetOwnedCamera(userId: string, cameraRaw: string | null): Promise<void> {
    if (!cameraRaw) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.ownedCameraName) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { ownedCameraRaw: cameraRaw, ownedCameraName: cameraRaw },
    });
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- photo-upload.service.spec.ts`
Expected: PASS 5/5

- [ ] **Step 5: 커밋**

```bash
git add src/photos/services/photo-upload.service.ts src/photos/services/photo-upload.service.spec.ts
git commit -m "feat: PhotoUploadService 추가 — 업로드 오케스트레이션 + 보유 장비 자동 등록"
```

---

### Task 6: `PhotosModule`

**Files:**
- Create: `src/photos/photos.module.ts`
- Modify: `src/app.module.ts` (PhotosModule import 추가)

**Interfaces:**
- Consumes: Task 1~5의 모든 서비스.
- Produces: `PhotosModule` (DI 그래프 완성, 이후 태스크의 컨트롤러가 이 모듈 안에 들어감).

- [ ] **Step 1: 모듈 작성 (아직 컨트롤러 없음 — Task 7에서 추가)**

`src/photos/photos.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExifService } from './services/exif.service';
import { ImageProcessingService } from './services/image-processing.service';
import { R2StorageService, S3_CLIENT, createR2Client } from './services/r2-storage.service';
import { PhotoLocationService } from './services/photo-location.service';
import { PhotoVisibilityService } from './services/photo-visibility.service';
import { PhotoUploadService } from './services/photo-upload.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ExifService,
    ImageProcessingService,
    R2StorageService,
    { provide: S3_CLIENT, useFactory: createR2Client },
    PhotoLocationService,
    PhotoVisibilityService,
    PhotoUploadService,
  ],
  exports: [PhotoLocationService, PhotoVisibilityService, PhotoUploadService, R2StorageService],
})
export class PhotosModule {}
```

- [ ] **Step 2: `AppModule`에 연결**

`src/app.module.ts`에서 `PhotosModule`을 import하고 `imports` 배열에 추가 (기존 `PrismaModule`, `AuthModule` 옆에).

- [ ] **Step 3: 앱이 정상 부팅하는지 확인 (새 테스트 없음 — 기존 전체 스위트로 DI 그래프 깨짐 여부 확인)**

Run: `npm test && npm run test:e2e && npm run typecheck && npm run build`
Expected: 전부 기존과 동일하게 PASS (아직 라우트가 없으니 새 동작도 없음, DI 와이어링만 늘어남).

- [ ] **Step 4: 커밋**

```bash
git add src/photos/photos.module.ts src/app.module.ts
git commit -m "feat: PhotosModule 추가 — 서비스 DI 와이어링"
```

---

### Task 7: `POST /photos` 업로드 엔드포인트

**Files:**
- Create: `src/photos/photos.controller.ts`
- Modify: `src/photos/photos.module.ts:controllers`
- Test: `test/photos-upload.e2e-spec.ts`

**Interfaces:**
- Consumes: `PhotoUploadService.uploadPhotos` (Task 5), `JwtAuthGuard` (`../auth/guards/jwt-auth.guard`).
- Produces: `POST /photos` (multipart, `files` 필드, 최대 10장, 파일당 25MB, JPEG/PNG/HEIC/HEIF만 허용).

- [ ] **Step 1: 실패하는 테스트 작성 — 실제 Postgres에 실제 EXIF 픽스처를 업로드하되, R2만 스텁으로 교체**

`test/photos-upload.e2e-spec.ts`:
```ts
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
      .useValue({ uploadBuffer: jest.fn().mockResolvedValue(undefined), buildPublicUrl: (k: string) => `https://cdn.test/${k}` })
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

  it('rejects more than 10 files with 400 and persists nothing', async () => {
    const agent = agentWithSession();
    await agent.post('/auth/login').send({ email: TEST_EMAIL, password: 'password123' });
    const buffer = await buildPlainJpeg();
    let req = agent.post('/photos');
    for (let i = 0; i < 11; i++) {
      req = req.attach('files', buffer, { filename: `${i}.jpg`, contentType: 'image/jpeg' });
    }
    await req.expect(400);

    const count = await prisma.photo.count({ where: { userId } });
    expect(count).toBe(0);
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photos-upload.e2e-spec.ts`
Expected: FAIL — `POST /photos` 라우트가 없어 404 (unauthenticated 케이스도 401이 아니라 404로 실패).

- [ ] **Step 3: 컨트롤러 구현**

`src/photos/photos.controller.ts`:
```ts
import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UnsupportedMediaTypeException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhotoUploadService } from './services/photo-upload.service';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class PhotosController {
  constructor(private readonly photoUploadService: PhotoUploadService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
          callback(new UnsupportedMediaTypeException(`지원하지 않는 파일 형식입니다: ${file.mimetype}`), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[] | undefined, @Req() req: AuthedRequest) {
    if (!files || files.length === 0) {
      throw new BadRequestException('업로드할 파일이 필요합니다.');
    }
    return this.photoUploadService.uploadPhotos(req.user.id, files);
  }
}
```

- [ ] **Step 4: `PhotosModule`에 컨트롤러 등록**

`src/photos/photos.module.ts`의 `@Module` 데코레이터에 `controllers: [PhotosController]` 추가, import 구문도 추가.

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photos-upload.e2e-spec.ts`
Expected: PASS 7/7

- [ ] **Step 6: 전체 스위트 확인**

Run: `npm test && npm run test:e2e && npm run typecheck && npm run build`
Expected: 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/photos/photos.controller.ts src/photos/photos.module.ts test/photos-upload.e2e-spec.ts
git commit -m "feat: POST /photos 업로드 엔드포인트 추가"
```

---

### Task 8: `PATCH /photos/:id/location` 수동 위치 등록

**Files:**
- Create: `src/photos/dto/set-location.dto.ts`
- Modify: `src/photos/photos.controller.ts`
- Test: `test/photos-location.e2e-spec.ts`

**Interfaces:**
- Consumes: `PhotoLocationService.setLocation` (Task 4).
- Produces: `PATCH /photos/:id/location` body `{ lat: number, lng: number }`.

- [ ] **Step 1: DTO 작성**

`src/photos/dto/set-location.dto.ts`:
```ts
import { IsLatitude, IsLongitude } from 'class-validator';

export class SetLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/photos-location.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';

const OWNER_EMAIL = 'photos-location-owner@example.com';
const OTHER_EMAIL = 'photos-location-other@example.com';

describe('PATCH /photos/:id/location', () => {
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

    const photo = await prisma.photo.create({ data: { userId: ownerId, originalKey: 'k' } });
    photoId = photo.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).patch(`/photos/${photoId}/location`).send({ lat: 37.5, lng: 127.0 }).expect(401);
  });

  it('rejects an invalid latitude with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/location`).send({ lat: 999, lng: 127.0 }).expect(400);
  });

  it('rejects a non-owner with 403', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    await agent.patch(`/photos/${photoId}/location`).send({ lat: 37.5, lng: 127.0 }).expect(403);
  });

  it('sets the location as MANUAL for the owner', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/location`).send({ lat: 37.5, lng: 127.0 }).expect(200);

    const coords = await photoLocationService.getCoordinates(photoId);
    expect(coords?.lat).toBeCloseTo(37.5, 5);
    const photo = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.locationSource).toBe('MANUAL');
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photos-location.e2e-spec.ts`
Expected: FAIL — 라우트 없음 (404).

- [ ] **Step 4: 컨트롤러에 라우트 추가**

`src/photos/photos.controller.ts`에 아래를 추가(생성자에 `PhotoLocationService` 주입, import 추가):
```ts
@UseGuards(JwtAuthGuard)
@Patch(':id/location')
setLocation(@Param('id') id: string, @Body() dto: SetLocationDto, @Req() req: AuthedRequest) {
  return this.photoLocationService.setLocation(id, req.user.id, { lat: dto.lat, lng: dto.lng }, 'MANUAL');
}
```
(`Body`, `Param`, `Patch`, `UseGuards`는 이미 import된 것과 합치고, `SetLocationDto`, `PhotoLocationService` import 추가)

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photos-location.e2e-spec.ts`
Expected: PASS 4/4

- [ ] **Step 6: 커밋**

```bash
git add src/photos/dto/set-location.dto.ts src/photos/photos.controller.ts test/photos-location.e2e-spec.ts
git commit -m "feat: PATCH /photos/:id/location 수동 위치 등록 엔드포인트 추가"
```

---

### Task 9: `PATCH /photos/:id/visibility` 공개범위 변경

**Files:**
- Create: `src/photos/dto/set-visibility.dto.ts`
- Modify: `src/photos/photos.controller.ts`
- Test: `test/photos-visibility.e2e-spec.ts`

**Interfaces:**
- Consumes: `PhotoVisibilityService.setVisibility` (Task 4).
- Produces: `PATCH /photos/:id/visibility` body `{ visibility: 'EXACT' | 'FUZZY' | 'HIDDEN' }`.

- [ ] **Step 1: DTO 작성**

`src/photos/dto/set-visibility.dto.ts`:
```ts
import { IsEnum } from 'class-validator';
import { PhotoVisibility } from '@prisma/client';

export class SetVisibilityDto {
  @IsEnum(PhotoVisibility)
  visibility: PhotoVisibility;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/photos-visibility.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';

const OWNER_EMAIL = 'photos-visibility-owner@example.com';
const OTHER_EMAIL = 'photos-visibility-other@example.com';

describe('PATCH /photos/:id/visibility', () => {
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

    const photo = await prisma.photo.create({ data: { userId: ownerId, originalKey: 'k' } });
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
    await request(app.getHttpServer()).patch(`/photos/${photoId}/visibility`).send({ visibility: 'HIDDEN' }).expect(401);
  });

  it('rejects an invalid enum value with 400', async () => {
    const agent = await loginAgent(OWNER_EMAIL);
    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'SECRET' }).expect(400);
  });

  it('rejects a non-owner with 403', async () => {
    const agent = await loginAgent(OTHER_EMAIL);
    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'HIDDEN' }).expect(403);
  });

  it('switches to HIDDEN and back to FUZZY without regenerating the offset', async () => {
    const agent = await loginAgent(OWNER_EMAIL);

    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'FUZZY' }).expect(200);
    const afterFirstFuzzy = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });

    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'HIDDEN' }).expect(200);
    await agent.patch(`/photos/${photoId}/visibility`).send({ visibility: 'FUZZY' }).expect(200);
    const afterSecondFuzzy = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } });

    expect(afterSecondFuzzy.fuzzyOffsetLat).toBe(afterFirstFuzzy.fuzzyOffsetLat);
    expect(afterSecondFuzzy.fuzzyOffsetLng).toBe(afterFirstFuzzy.fuzzyOffsetLng);
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photos-visibility.e2e-spec.ts`
Expected: FAIL — 라우트 없음 (404).

- [ ] **Step 4: 컨트롤러에 라우트 추가**

`src/photos/photos.controller.ts`에 추가(생성자에 `PhotoVisibilityService` 주입, import 추가):
```ts
@UseGuards(JwtAuthGuard)
@Patch(':id/visibility')
setVisibility(@Param('id') id: string, @Body() dto: SetVisibilityDto, @Req() req: AuthedRequest) {
  return this.photoVisibilityService.setVisibility(id, req.user.id, dto.visibility);
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photos-visibility.e2e-spec.ts`
Expected: PASS 4/4

- [ ] **Step 6: 커밋**

```bash
git add src/photos/dto/set-visibility.dto.ts src/photos/photos.controller.ts test/photos-visibility.e2e-spec.ts
git commit -m "feat: PATCH /photos/:id/visibility 공개범위 변경 엔드포인트 추가"
```

---

### Task 10: `GET /photos/:id` 상세 조회

**Files:**
- Create: `src/photos/photos.service.ts`
- Modify: `src/photos/photos.controller.ts`
- Modify: `src/photos/photos.module.ts`
- Test: `test/photos-detail.e2e-spec.ts`

**Interfaces:**
- Consumes: `PhotoVisibilityService.toPublicLocation` (Task 4), `R2StorageService.buildPublicUrl` (Task 1).
- Produces: `GET /photos/:id` (인증 불필요, PRD 기능5), `PhotosService.getDetail(photoId: string): Promise<PhotoDetailView>`.

- [ ] **Step 1: 실패하는 테스트 작성 — exact/fuzzy/hidden 공개범위별 응답과, 비공개(운영자 조치)된 사진의 404를 확인**

`test/photos-detail.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhotoLocationService } from '../src/photos/services/photo-location.service';
import { PhotoVisibilityService } from '../src/photos/services/photo-visibility.service';

const EMAIL = 'photos-detail-user@example.com';

describe('GET /photos/:id', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let photoLocationService: PhotoLocationService;
  let photoVisibilityService: PhotoVisibilityService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    photoLocationService = moduleRef.get(PhotoLocationService);
    photoVisibilityService = moduleRef.get(PhotoVisibilityService);

    const user = await prisma.user.create({ data: { email: EMAIL, passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns 404 for a non-existent photo', async () => {
    await request(app.getHttpServer()).get('/photos/does-not-exist').expect(404);
  });

  it('returns exact coordinates for EXACT visibility', async () => {
    const photo = await prisma.photo.create({
      data: { userId, originalKey: 'k', servingKey: 's', thumbnailKey: 't', cameraName: 'ILCE-7M4', visibility: 'EXACT' },
    });
    await photoLocationService.setLocation(photo.id, userId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.cameraName).toBe('ILCE-7M4');
    expect(res.body.location.lat).toBeCloseTo(37.5, 5);
    expect(res.body.locationLabel).toBe('exact');
  });

  it('returns fuzzy (offset) coordinates for FUZZY visibility, not the real ones', async () => {
    const photo = await prisma.photo.create({
      data: { userId, originalKey: 'k', visibility: 'FUZZY' },
    });
    await photoLocationService.setLocation(photo.id, userId, { lat: 37.5, lng: 127.0 }, 'EXIF');
    await photoVisibilityService.ensureFuzzyOffset(photo.id);

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.location).not.toEqual({ lat: 37.5, lng: 127.0 });
    expect(res.body.locationLabel).toBe('approximate');
  });

  it('returns no location for HIDDEN visibility', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', visibility: 'HIDDEN' } });
    await photoLocationService.setLocation(photo.id, userId, { lat: 37.5, lng: 127.0 }, 'EXIF');

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.location).toBeNull();
    expect(res.body.locationLabel).toBe('hidden');
  });

  it('returns null location (not an error) for a photo with no location set yet', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k' } });

    const res = await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(200);

    expect(res.body.location).toBeNull();
  });

  it('returns 404 for a photo moderated to HIDDEN status (not the same as visibility HIDDEN)', async () => {
    const photo = await prisma.photo.create({ data: { userId, originalKey: 'k', status: 'HIDDEN' } });

    await request(app.getHttpServer()).get(`/photos/${photo.id}`).expect(404);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm run test:e2e -- photos-detail.e2e-spec.ts`
Expected: FAIL — 라우트 없음 (404 on the non-existent-photo case passes by accident, but the EXACT/FUZZY/HIDDEN cases fail since there's no route at all yet — all return 404 instead of 200).

- [ ] **Step 3: `PhotosService` 구현**

`src/photos/photos.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PhotoVisibilityService } from './services/photo-visibility.service';
import { R2StorageService } from './services/r2-storage.service';

export interface PhotoDetailView {
  id: string;
  cameraName: string | null;
  lensName: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  takenAt: Date | null;
  note: string | null;
  location: { lat: number; lng: number } | null;
  locationLabel: 'exact' | 'approximate' | 'hidden';
  servingUrl: string;
  thumbnailUrl: string;
  userId: string;
  likeCount: number;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoVisibilityService: PhotoVisibilityService,
    private readonly r2: R2StorageService,
  ) {}

  async getDetail(photoId: string): Promise<PhotoDetailView> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.status !== 'ACTIVE') {
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    }

    const location = await this.photoVisibilityService.toPublicLocation(photo);
    const locationLabel: 'exact' | 'approximate' | 'hidden' =
      photo.visibility === 'HIDDEN' ? 'hidden' : photo.visibility === 'EXACT' ? 'exact' : 'approximate';
    const likeCount = await this.prisma.like.count({ where: { photoId } });

    return {
      id: photo.id,
      cameraName: photo.cameraName,
      lensName: photo.lensName,
      focalLength: photo.focalLength,
      aperture: photo.aperture,
      shutterSpeed: photo.shutterSpeed,
      iso: photo.iso,
      takenAt: photo.takenAt,
      note: photo.note,
      location,
      locationLabel,
      servingUrl: photo.servingKey ? this.r2.buildPublicUrl(photo.servingKey) : '',
      thumbnailUrl: photo.thumbnailKey ? this.r2.buildPublicUrl(photo.thumbnailKey) : '',
      userId: photo.userId,
      likeCount,
    };
  }
}
```

- [ ] **Step 4: 컨트롤러에 라우트 추가**

`src/photos/photos.controller.ts`에 추가(생성자에 `PhotosService` 주입, import 추가):
```ts
@Get(':id')
getDetail(@Param('id') id: string) {
  return this.photosService.getDetail(id);
}
```
(`Get`은 이미 import된 `@nestjs/common` 구문에 합치기)

- [ ] **Step 5: `PhotosModule`에 `PhotosService` 등록**

`src/photos/photos.module.ts`의 `providers`에 `PhotosService` 추가, import 구문 추가.

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `npm run test:e2e -- photos-detail.e2e-spec.ts`
Expected: PASS 6/6

- [ ] **Step 7: 전체 스위트 확인**

Run: `npm test && npm run test:e2e && npm run typecheck && npm run build`
Expected: 전부 PASS.

- [ ] **Step 8: 커밋**

```bash
git add src/photos/photos.service.ts src/photos/photos.controller.ts src/photos/photos.module.ts test/photos-detail.e2e-spec.ts
git commit -m "feat: GET /photos/:id 상세 조회 엔드포인트 추가"
```
