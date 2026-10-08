import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhotosModule } from '../photos/photos.module';
import { DiscoveryController } from './discovery.controller';
import { PhotoFilterService } from './services/photo-filter.service';
import { DiscoveryMapService } from './services/discovery-map.service';
import { DiscoveryGalleryService } from './services/discovery-gallery.service';

@Module({
  imports: [PrismaModule, PhotosModule],
  controllers: [DiscoveryController],
  providers: [PhotoFilterService, DiscoveryMapService, DiscoveryGalleryService],
})
export class DiscoveryModule {}
