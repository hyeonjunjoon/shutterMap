import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { requireEnv } from '../src/common/require-env';

describe('CORS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts의 bootstrap()은 Test.createTestingModule 경로를 안 타므로(기존
    // cookieParser()도 각 e2e 테스트가 직접 다시 적용하는 것과 동일한 이유),
    // 여기서도 main.ts와 동일한 설정을 직접 적용해서 동작을 검증한다.
    // origin을 문자열로 그대로 넘기면 cors 패키지가 요청의 실제 Origin과
    // 비교하지 않고 이 값을 무조건 반사한다 — 함수로 줘서 실제로 일치할 때만 허용한다.
    const webOrigin = requireEnv('WEB_ORIGIN');
    const corsOrigin: CustomOrigin = (requestOrigin, callback) => callback(null, requestOrigin === webOrigin);
    app.enableCors({ origin: corsOrigin, credentials: true });
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows the configured WEB_ORIGIN with credentials', async () => {
    const webOrigin = requireEnv('WEB_ORIGIN');
    const res = await request(app.getHttpServer()).get('/auth/me').set('Origin', webOrigin);

    expect(res.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('omits Access-Control-Allow-Origin for an arbitrary, unconfigured origin', async () => {
    // "값이 evil.example.com이 아니다"처럼 약하게 비교하면 헤더가 아예 없어도
    // 통과해서 아무것도 증명 못한다 — 실제로 헤더가 비어있는지(undefined)를
    // 직접 확인한다.
    const res = await request(app.getHttpServer()).get('/auth/me').set('Origin', 'http://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
