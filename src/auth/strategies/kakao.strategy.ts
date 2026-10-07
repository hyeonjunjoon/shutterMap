import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-kakao';

@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
  constructor() {
    super({
      clientID: process.env.KAKAO_CLIENT_ID,
      callbackURL: process.env.KAKAO_CALLBACK_URL,
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return {
      providerId: String(profile.id),
      email: profile._json?.kakao_account?.email ?? `kakao-${profile.id}@no-email.shuttermap`,
    };
  }
}
