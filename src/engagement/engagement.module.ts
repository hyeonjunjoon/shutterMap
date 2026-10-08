import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EngagementController } from './engagement.controller';
import { LikeService } from './services/like.service';

@Module({
  imports: [PrismaModule],
  controllers: [EngagementController],
  providers: [LikeService],
})
export class EngagementModule {}
