import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.authService.login(dto);
    res.cookie('session', token, SESSION_COOKIE_OPTIONS);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: { id: string; email: string } }) {
    return req.user;
  }

  @Get('kakao')
  @UseGuards(AuthGuard('kakao'))
  kakaoLogin() {} // passport가 카카오 인증 페이지로 리다이렉트

  @Get('kakao/callback')
  @UseGuards(AuthGuard('kakao'))
  async kakaoCallback(
    @Req() req: Request & { user: { providerId: string; email: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.findOrCreateSocialUser('KAKAO', req.user.providerId, req.user.email);
    const token = await this.authService.issueSessionToken(user.id, user.email);
    res.cookie('session', token, SESSION_COOKIE_OPTIONS);
    res.redirect('/'); // 프론트 메인으로
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: { providerId: string; email: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.findOrCreateSocialUser('GOOGLE', req.user.providerId, req.user.email);
    const token = await this.authService.issueSessionToken(user.id, user.email);
    res.cookie('session', token, SESSION_COOKIE_OPTIONS);
    res.redirect('/');
  }
}
