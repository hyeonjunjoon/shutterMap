import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryController } from './discovery.controller';
import { PhotoFilterService } from './services/photo-filter.service';
import { DiscoveryMapService } from './services/discovery-map.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiscoveryController],
  providers: [PhotoFilterService, DiscoveryMapService],
})
export class DiscoveryModule {}
