import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LikeService } from './services/like.service';

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class EngagementController {
  constructor(private readonly likeService: LikeService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.likeService.toggle(id, req.user.id);
  }
}
