import { IsEmail, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  // bcrypt는 72바이트 뒤는 조용히 잘라서 해시한다 — 그 이상은 막아서
  // "둘 다 로그인되는 다른 비밀번호" 같은 혼란을 애초에 없앤다.
  // ponytail: 문자 수 기준(72자)이라 멀티바이트(한글 등) 비밀번호는 72바이트보다
  // 먼저 걸릴 수 있다 — 바이트 단위로 더 정확히 하려면 커스텀 밸리데이터로 올려라.
  @MaxLength(72)
  password: string;
}
