import { Controller, Get, Query } from '@nestjs/common';
import { MapQueryDto } from './dto/map-query.dto';
import { DiscoveryMapService } from './services/discovery-map.service';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryMapService: DiscoveryMapService) {}

  @Get('map')
  getMap(@Query() query: MapQueryDto) {
    return this.discoveryMapService.getPins(
      {
        minLat: Number(query.minLat),
        maxLat: Number(query.maxLat),
        minLng: Number(query.minLng),
        maxLng: Number(query.maxLng),
      },
      {
        cameraName: query.cameraName,
        lensName: query.lensName,
        minFocalLength: query.minFocalLength != null ? Number(query.minFocalLength) : undefined,
        maxFocalLength: query.maxFocalLength != null ? Number(query.maxFocalLength) : undefined,
        minAperture: query.minAperture != null ? Number(query.minAperture) : undefined,
        maxAperture: query.maxAperture != null ? Number(query.maxAperture) : undefined,
        month: query.month != null ? Number(query.month) : undefined,
      },
    );
  }
}
