---
category: conventions
tags: [skills-cli, tooling, installation, gotcha]
related_files:
  - skills-lock.json
---

# `npx skills add <repo>`를 `--skill` 없이 실행하면 그 레포의 스킬 전부를 설치하려 든다

## 문제
`vercel-labs/agent-skills`에서 `web-design-guidelines` 하나만 설치하려고 했는데, 명령 파이프라인 중간에 `--skill` 플래그를 빼고 실행한 적이 있었다. 그러자 CLI가 비대화형으로 "Installing all 9 skills"로 넘어갔다 — 의도한 범위를 벗어나 설치가 진행될 뻔했다. 다행히 그 호출은 `head -60`으로 파이프된 상태라 프로세스가 일찍 종료돼 실제로는 `web-design-guidelines`만 기록됐지만(운이었다), 설치 범위가 커질 수 있는 위험한 패턴이었다.

## 원인
이 CLI는 타겟 스킬을 좁히는 `--skill <name>` 인자가 없으면, 비대화형 환경(TTY 없음/파이프)에서 "전체 설치"로 기본 동작한다. 사용자가 "하나만 설치해달라"고 말해도, 명령 자체에 `--skill`을 빠뜨리면 그 의도가 전달되지 않는다.

## 해결책
설치 후 `skills-lock.json`과 실제 디렉토리 목록(`.claude/skills/`, `.agents/skills/`)을 대조해서 의도한 것만 설치됐는지 확인했고, 사용자에게 투명하게 "전체 설치로 넘어갈 뻔했다"는 걸 그대로 보고했다. 이후 호출부터는 `--skill <정확한 이름>`을 항상 명시했다.

## 다음 작업 전 체크할 것
- [ ] **`npx skills add <repo>`를 실행할 때 특정 스킬만 필요하면 반드시 `--skill <name>`을 붙인다.** 빠뜨리면 그 레포의 스킬 전체를 설치하려 든다.
- [ ] 이 명령을 실행한 뒤에는 항상 `skills-lock.json`과 실제 설치된 디렉토리를 대조해서, 의도한 스킬만 들어왔는지 확인한다 — stdout이 파이프로 잘려서 안 보일 수도 있다.
