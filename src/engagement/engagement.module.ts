import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EngagementController } from './engagement.controller';
import { LikeService } from './services/like.service';
import { ReportService } from './services/report.service';

@Module({
  imports: [PrismaModule],
  controllers: [EngagementController],
  providers: [LikeService, ReportService],
})
export class EngagementModule {}
