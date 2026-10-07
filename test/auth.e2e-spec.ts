import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('GET /auth/me', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns 401 without a session cookie', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns 401 with a tampered cookie', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', ['session=not-a-real-jwt'])
      .expect(401);
  });

  it('returns the user after register + login', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send({ email: 'me-test@example.com', password: 'password123' });
    await agent.post('/auth/login').send({ email: 'me-test@example.com', password: 'password123' });
    const res = await agent.get('/auth/me').expect(200);
    expect(res.body.email).toBe('me-test@example.com');
  });
});
