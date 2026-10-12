import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// JwtAuthGuard와 같은 'jwt' 전략을 쓰지만, 토큰이 없거나 유효하지 않아도 막지
// 않는다 — 기본 handleRequest는 user가 없으면 던지는데, 그냥 그대로(undefined
// 포함) 반환해서 공개 엔드포인트가 "로그인했으면 추가 정보, 안 했으면 없이"로
// 동작하게 한다 (예: GET /photos/:id의 likedByMe).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
