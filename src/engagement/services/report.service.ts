import { Injectable, NotFoundException } from '@nestjs/common';
import { ReportReason, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubmitReportInput {
  reason: ReportReason;
  detail?: string;
}

export interface SubmittedReport {
  id: string;
  photoId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(photoId: string, reporterId: string, input: SubmitReportInput): Promise<SubmittedReport> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException('사진을 찾을 수 없습니다.');
    }

    const report = await this.prisma.report.create({
      data: { photoId, reporterId, reason: input.reason, detail: input.detail },
    });

    return {
      id: report.id,
      photoId: report.photoId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    };
  }
}
