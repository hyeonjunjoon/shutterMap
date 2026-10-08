---
category: conventions
tags: [curl, qa, multipart, shell-quoting, testing-methodology]
related_files: []
---

# curl 멀티파트 테스트에서 `-F` 인자를 쉘 변수에 풀어 넣으면 조용히 깨짐

## 문제
`/qa`에서 실 서버에 11개 파일을 업로드해 "개수 초과 400"을 확인하려고, `-F files=@...;type=image/jpeg` 문자열들을 쉘 변수(`ARGS="$ARGS -F files=@..."`)에 이어붙여서 `curl $ARGS`로 실행했다. 결과는 400이 맞게 나왔지만, 메시지가 기대한 "Unexpected file field"(multer의 개수 초과 에러)가 아니라 "업로드할 파일이 필요합니다"(우리 쪽 "파일 0개" 가드)였다 — 즉 파일이 실제로는 하나도 안 첨부된 채로 요청이 간 것이다. 서버 버그처럼 보일 뻔했다.

## 원인
`-F files=@/tmp/a.jpg;type=image/jpeg` 안의 세미콜론이, 변수에 담겨서 언쿼팅된 채로 재전개(word-splitting)될 때 쉘에 의해 깨졌다. curl에 실제로 전달된 인자가 의도한 것과 달라져서 파일 첨부 자체가 안 먹혔다.

## 해결책
`-F` 인자는 변수에 문자열로 이어붙이지 않고, 각각을 curl 명령에 직접 쿼팅된 리터럴로 나열했다 (`curl -F "files=@a.jpg;type=image/jpeg" -F "files=@b.jpg;type=image/jpeg" ...`). 그렇게 다시 돌리니 정확한 에러 메시지("Unexpected file field - files")가 나왔다.

## 다음 작업 전 체크할 것
- [ ] **curl로 멀티파트(`-F`) 테스트를 쉘 스크립트로 자동화할 때, `-F` 인자들을 문자열 변수에 이어붙이지 않는다.** 배열(`args=(...)` + `"${args[@]}"`)을 쓰거나, 각 `-F`를 명령줄에 직접 나열한다.
- [ ] live QA에서 "예상과 다른 에러 메시지"가 나오면, 먼저 "내가 보낸 요청이 실제로 의도한 그 요청인가"(로그, `-v`, 응답 메시지 전체)를 확인하고 나서 "서버 버그"로 결론 내린다 — 이번처럼 테스트 하네스 자체의 실수일 수 있다.
