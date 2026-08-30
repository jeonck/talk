# talk.metacog.co.kr — 하루 한 문장 · 5분 말하기 연습

문법·단어·듣기·말하기를 따로 공부하는 대신, **한 문장을 원어민 소리에 가깝게 말할 수 있을 때까지**
하루 5분 반복하도록 돕는 연습 사이트입니다. Hugo + PaperMod로 만들고 GitHub Pages에 호스팅합니다.

- 사이트: <https://talk.metacog.co.kr>
- 테마: [PaperMod](https://github.com/adityatelange/hugo-PaperMod) (git submodule)

## 사이트가 제공하는 연습 기능

| 기능 | 설명 |
| --- | --- |
| 문장 듣기 | 브라우저 음성 합성(Web Speech API)으로 문장을 읽어 줍니다. 0.6 / 0.8 / 보통 속도, 10회 연속 듣기 지원 |
| 청크 듣기 | 문장을 의미 덩어리로 쪼개 하나씩 듣고 따라 말합니다 |
| 5분 타이머 | 듣기 1분 → 이해 1분 → 따라 말하기 2분 → 녹음 비교 1분을 자동으로 안내합니다 |
| 반복 횟수 세기 | 따라 말할 때마다 탭(또는 스페이스바)해서 목표 30회를 채웁니다 |
| 녹음 & 비교 | 내 목소리를 녹음해 원어민 소리와 번갈아 듣습니다 (기기 안에서만 처리) |
| 문장 가리기 | 글자를 읽지 않고 소리만으로 따라 말하도록 문장을 흐리게 가립니다 |
| 연습 기록 | 반복 횟수·완료 문장·연속 학습일을 브라우저 `localStorage`에 저장합니다 (서버 전송 없음) |

## 로컬에서 실행하기

```bash
git clone --recurse-submodules https://github.com/jeonck/talk.git
cd talk
hugo server -D          # http://localhost:1313
```

이미 클론한 뒤라면 테마 서브모듈을 먼저 받아야 합니다.

```bash
git submodule update --init --recursive
```

Hugo는 **extended 버전 0.148.2 이상**이 필요합니다(PaperMod가 0.146+ 요구).

## 문장 추가하기

```bash
hugo new sentences/091-my-new-sentence.md
```

`archetypes/sentences.md` 틀이 적용됩니다. 프런트매터 필드는 다음과 같습니다.

| 필드 | 용도 |
| --- | --- |
| `english` / `korean` | 연습할 문장과 우리말 뜻 |
| `situation` | 언제, 누구에게 쓰는 표현인지 (2단계 '이해'에서 노출) |
| `nuance` | 비슷한 표현과의 차이, 왜 이렇게 말하는지 |
| `weight` | 목록 정렬 순서 (오늘의 문장 회전 순서이기도 합니다) |
| `level`, `tags` | 난이도와 분류 |
| `chunks[]` | `en`, `ko`, `tip` — 청크 듣기 버튼이 됩니다 |
| `pronunciation[]` | `point`, `detail` — 연음·축약 등 발음 포인트 |
| `vocab[]` | `word`, `meaning` |
| `variations[]` | `en`, `ko` — 같은 상황의 다른 표현 (듣기 버튼 포함) |
| `dialogue[]` | `speaker`, `en`, `ko` — 짧은 대화 예시 (듣기 버튼 포함) |

홈의 '오늘의 문장'은 접속한 날짜(연중 일수)를 문장 수로 나눈 나머지로 정해지므로,
문장을 추가하면 자동으로 회전 대상에 포함됩니다.

## 배포

`main` 브랜치에 푸시하면 `.github/workflows/hugo.yml`이 Hugo로 빌드해 GitHub Pages에 배포합니다.

최초 1회 저장소 설정이 필요합니다.

1. **Settings → Pages → Build and deployment → Source**를 `GitHub Actions`로 변경
2. **Settings → Pages → Custom domain**에 `talk.metacog.co.kr` 입력 후 저장
3. DNS 확인이 끝나면 **Enforce HTTPS** 체크

커스텀 도메인은 `static/CNAME`에도 들어 있어 빌드 결과물에 항상 포함됩니다.
DNS는 `talk` 서브도메인의 CNAME을 `jeonck.github.io`로 향하게 두면 됩니다.

> 문장 듣기(Web Speech API)와 녹음(MediaRecorder)은 HTTPS에서만 동작하므로,
> 커스텀 도메인의 HTTPS가 켜져 있어야 합니다.

## 디렉터리

```
content/sentences/   연습 문장 (문장 하나 = 파일 하나)
content/guide/       연습 원리와 5분 루틴 설명
layouts/sentences/   연습 화면 템플릿
layouts/home.html    오늘의 문장 + 목록
layouts/record/      연습 기록 화면
assets/js/practice.js       듣기·타이머·카운터·녹음·기록 로직
assets/css/extended/practice.css  연습 화면 스타일
```
