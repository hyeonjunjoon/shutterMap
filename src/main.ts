import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';
import { requireEnv } from './common/require-env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const webOrigin = requireEnv('WEB_ORIGIN');
  // origin을 문자열로 그대로 넘기면 cors 패키지가 요청의 실제 Origin과
  // 비교하지 않고 이 값을 무조건 반사한다(모르는 호출자에게도 설정값이 그대로
  // 노출됨) — 함수로 줘서 실제로 일치할 때만 허용한다.
  const corsOrigin: CustomOrigin = (requestOrigin, callback) => callback(null, requestOrigin === webOrigin);
  app.enableCors({ origin: corsOrigin, credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
