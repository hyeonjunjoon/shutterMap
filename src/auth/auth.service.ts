import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ id: string; email: string }> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash, provider: 'LOCAL' },
      });
      return { id: user.id, email: user.email };
    } catch (error) {
      // 사전 findUnique 체크만으로는 동시 가입 요청(TOCTOU) 사이의 경쟁을 못 막는다 —
      // DB의 @@unique([provider, email]) 제약을 최종 방어선으로 쓴다.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('이미 가입된 이메일입니다.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { provider_email: { provider: 'LOCAL', email: dto.email } },
    });
    // 계정 존재 여부를 노출하지 않기 위해 "없음"과 "비밀번호 틀림"을 같은 메시지로 처리
    const INVALID = '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(INVALID);
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(INVALID);
    }
    const token = await this.jwtService.signAsync({ sub: user.id, email: user.email });
    return { token };
  }

  async findOrCreateSocialUser(
    provider: 'KAKAO' | 'GOOGLE',
    providerId: string,
    email: string,
  ): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    if (existing) {
      return { id: existing.id, email: existing.email };
    }
    try {
      const created = await this.prisma.user.create({
        data: { email, provider, providerId },
      });
      return { id: created.id, email: created.email };
    } catch (error) {
      // register()와 같은 TOCTOU 레이스 — 동시 OAuth 콜백(더블클릭, 중복 탭)이
      // 둘 다 findUnique에서 null을 본 뒤 둘 다 create를 시도할 수 있다.
      // 진 쪽은 터지지 않고, 승자가 만든 레코드를 재조회해 반환한다.
      if (isUniqueConstraintError(error)) {
        const winner = await this.prisma.user.findUnique({
          where: { provider_providerId: { provider, providerId } },
        });
        if (winner) {
          return { id: winner.id, email: winner.email };
        }
      }
      throw error; // winner가 없으면(이론상 불가하지만) 원래 에러를 그대로 던진다
    }
  }

  async issueSessionToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, email });
  }
}
