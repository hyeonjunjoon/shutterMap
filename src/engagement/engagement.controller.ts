import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LikeService } from './services/like.service';
import { ReportService } from './services/report.service';
import { CreateReportDto } from './dto/create-report.dto';

type AuthedRequest = Request & { user: { id: string; email: string } };

@Controller('photos')
export class EngagementController {
  constructor(
    private readonly likeService: LikeService,
    private readonly reportService: ReportService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.likeService.toggle(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reports')
  submitReport(@Param('id') id: string, @Body() dto: CreateReportDto, @Req() req: AuthedRequest) {
    return this.reportService.submit(id, req.user.id, { reason: dto.reason, detail: dto.detail });
  }
}
