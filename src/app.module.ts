import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PhotosModule } from './photos/photos.module';
import { DiscoveryModule } from './discovery/discovery.module';

@Module({
  imports: [PrismaModule, AuthModule, PhotosModule, DiscoveryModule],
  controllers: [AppController],
  providers: [
    AppService,
    // APP_PIPE ensures the DTO validators (RegisterDto, LoginDto, ...) actually
    // run — registering this only in main.ts would miss any app built via
    // Test.createTestingModule({ imports: [AppModule] }), which e2e tests do.
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true }) },
  ],
})
export class AppModule {}
