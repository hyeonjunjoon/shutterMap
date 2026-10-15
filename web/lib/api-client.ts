const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  // FormData일 때 Content-Type을 직접 지정하면 브라우저가 자동으로 붙이는
  // multipart boundary가 빠져서 서버가 파싱을 못 한다 — 아예 설정 안 하고
  // 브라우저에게 맡긴다(다음 플랜의 사진 업로드가 이 경로를 쓴다).
  // body가 없는 GET에 Content-Type을 붙이면 "단순 요청"이 아니게 돼서
  // cross-origin(웹:3001/API:3000)일 때 매 요청 앞에 OPTIONS preflight가
  // 하나씩 더 붙는다 — body가 실제로 있을 때만 설정한다.
  if (!isFormData && options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  // NestJS의 PATCH 엔드포인트 다수가 200 + 빈 body를 돌려준다 — 빈 문자열을
  // .json()으로 바로 파싱하면 그 자체로 SyntaxError가 나서, text()로 먼저
  // 받아 빈 문자열인지 확인한다. JSON이 아닌 응답(프록시 에러 페이지 등)도
  // 같은 이유로 try/catch로 감싸 ApiError로 통일한다.
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, '서버 응답을 해석할 수 없습니다.');
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractErrorMessage(body));
  }

  return body as T;
}
