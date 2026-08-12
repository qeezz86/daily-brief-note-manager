import type {
  AdditionalInstructionConflictClass,
  NonNewsAuthoringPromptTemplateVersion,
  SupportedNonNewsCategoryId,
} from './nonNewsPrompts.types'

export const NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION:
NonNewsAuthoringPromptTemplateVersion = 'non-news-authoring-prompt-v1'

export const ADDITIONAL_INSTRUCTION_CONFLICT_RULESET_VERSION = 1 as const

export const NON_NEWS_PROMPT_BOUNDARIES = Object.freeze({
  begin: '[BEGIN_NON_NEWS_AUTHORING_PROMPT]',
  end: '[END_NON_NEWS_AUTHORING_PROMPT]',
})

export const NON_NEWS_PROMPT_SECTION_ORDER = Object.freeze([
  '[작업 및 카테고리]',
  '[새 글 브리프]',
  '[중복 방지 컨텍스트]',
  '[카테고리 필수 작성 규칙]',
  '[최종 출력 계약]',
  '[사용자 추가 지시]',
  '[우선순위 및 비재정의 규칙]',
] as const)

export const NON_NEWS_CANONICAL_OUTPUT_ORDER = Object.freeze([
  'SEO 입력용 대표 제목',
  'SEO 대안 제목 4개',
  '메타 설명',
  'URL 슬러그',
  '포커스 키워드',
  'SEO 태그 5~8개',
  '워드프레스 본문용 HTML — 하나의 연속된 HTML 코드 블록, 올바른 wrapper, <h1>, 최종 닫는 wrapper, HTML 내부 이미지 프롬프트 금지',
  '대표 이미지 프롬프트',
  '이미지 ALT 문구',
  '발행 전 체크리스트',
] as const)

export const NON_NEWS_INSTRUCTION_PRECEDENCE = Object.freeze([
  '안전·노출·저작권 규칙',
  '카테고리 작성 규칙',
  '최종 출력 계약과 활성 카테고리 설정',
  'Phase 5I 중복 방지 컨텍스트 원문',
  '주제와 각도·초점',
  '사용자 추가 지시',
] as const)

export const NON_NEWS_CATEGORY_RULES = Object.freeze({
  'ai-column': Object.freeze({
    category: 'ai-column' as const,
    name: 'AI 칼럼',
    contentGroup: 'ai' as const,
    mandatoryRules: Object.freeze([
      '초보자가 이해할 수 있는 정의를 먼저 제시한다.',
      '작동 메커니즘과 핵심 원리를 단계적으로 설명한다.',
      '유사 개념 또는 대안과 비교한다.',
      '실제 적용 사례와 실용적인 예시를 포함한다.',
      '이점과 기대 효과를 구체적으로 설명한다.',
      '한계와 실패 가능성을 숨기지 않는다.',
      '보안 위험과 대응 원칙을 설명한다.',
      '개인정보 보호 영향을 설명한다.',
      '중요 결과의 검증 방법을 제시한다.',
      '사람의 감독과 최종 책임을 명시한다.',
      '현재 가능한 기능과 미래 전망을 구분한다.',
      '검색 의도와 연결된 FAQ를 포함한다.',
      '기관·제목·게시 또는 업데이트 시각·개별 원문 URL·확인 사항이 있는 출처를 사용한다.',
      '관련성이 높은 이전 AI 칼럼 링크를 포함한다.',
      '활성 category wrapper·표시 ID 패턴·slug 패턴을 그대로 따른다.',
      '정해진 SEO 및 10개 최종 출력 계약을 따른다.',
      '사실은 독립적으로 재작성하고 기사 전문·대량 인용·전체 번역을 복제하지 않는다.',
    ]),
  }),
  'info-db': Object.freeze({
    category: 'info-db' as const,
    name: '정보DB',
    contentGroup: 'info_db' as const,
    mandatoryRules: Object.freeze([
      '초보자용 정의를 가장 먼저 제시한다.',
      '핵심 원리와 작동 배경을 설명한다.',
      '주요 구성 요소를 구조적으로 설명한다.',
      '유사 개념 또는 대안과 비교한다.',
      '이해를 돕는 실제 예시를 포함한다.',
      '자주 생기는 오해와 바로잡는 설명을 포함한다.',
      '중요한 한계와 주의 사항을 빠뜨리지 않는다.',
      '시점에 따라 변하는 정보는 최신 개별 출처로 검증한다.',
      '확인된 사실과 예측·전망을 명확히 구분한다.',
      '핵심 포인트 요약을 포함한다.',
      '검색 의도와 연결된 FAQ를 포함한다.',
      '기관·제목·게시 또는 업데이트 시각·개별 원문 URL·확인 사항이 있는 출처를 사용한다.',
      '관련성이 높은 이전 정보DB 링크를 포함한다.',
      '활성 category wrapper·표시 ID 패턴·slug 패턴을 그대로 따른다.',
      '정해진 SEO 및 10개 최종 출력 계약을 따른다.',
    ]),
  }),
  'chinese-study': Object.freeze({
    category: 'chinese-study' as const,
    name: '중국어 학습',
    contentGroup: 'chinese' as const,
    mandatoryRules: Object.freeze([
      'CCTV 공식 개별 기사 또는 영상 URL을 사용한다.',
      '홈페이지·검색 결과·목록 페이지만 출처로 사용하지 않는다.',
      'CCTV 프로그램명을 기록한다.',
      '중국어 원문 제목을 기록한다.',
      '원문의 게시 또는 업데이트 시각을 기록한다.',
      '원문에서 실제로 확인한 핵심 사실을 기록한다.',
      '원문에 실제로 존재하는 핵심 문장 3~5개만 학습 목적으로 사용한다.',
      '모든 학습 문장과 표현에 성조가 표시된 병음을 제공한다.',
      '자연스러운 한국어 해석을 제공한다.',
      '핵심 어휘와 뜻을 정리한다.',
      '문장 구조를 학습자 관점에서 설명한다.',
      '실용 표현은 원문 복제가 아니라 독립적으로 작성한다.',
      '정확히 세 문항의 복습 퀴즈를 제공한다.',
      '응용 문장과 CCTV 원문 인용을 명확히 구분한다.',
      '기사 전문·전체 자막·전체 번역을 복제하지 않는다.',
      '원문에 없는 표현을 CCTV 표현으로 꾸며내지 않는다.',
      '활성 설정에 등록된 wrapper를 그대로 사용한다.',
      '프로그램명·원문 제목·시각·개별 URL·확인 사실이 있는 출처 확인 구조를 포함한다.',
      '관련성이 높은 이전 중국어 학습 글 링크를 포함한다.',
      '학습 목적의 최소 인용과 독립 작성 원칙을 밝히는 저작권 메모를 포함한다.',
      '정해진 SEO 및 10개 최종 출력 계약을 따른다.',
      '제목과 템플릿의 시리즈 번호는 [번호] 그대로 두고 생성·추정·증가시키지 않는다.',
    ]),
  }),
})

export const ADDITIONAL_INSTRUCTION_CONFLICT_RULES: readonly Readonly<{
  class: AdditionalInstructionConflictClass
  message: string
  patterns: readonly RegExp[]
}>[] = Object.freeze([
  Object.freeze({
    class: 'hierarchy-bypass' as const,
    message: '고정 규칙을 무시하거나 우회·재정의하는 지시는 사용할 수 없습니다.',
    patterns: Object.freeze([
      /(?:무시|우회|재정의|덮어쓰|override|ignore|bypass)[\s\S]{0,32}(?:규칙|지시|우선순위|계약|system|instruction)/iu,
      /(?:규칙|지시|우선순위|계약|system|instruction)[\s\S]{0,32}(?:무시|우회|재정의|덮어쓰|override|ignore|bypass)/iu,
    ]),
  }),
  Object.freeze({
    class: 'mandatory-output-change' as const,
    message: '필수 섹션이나 10개 출력 순서를 제거·재배치·교체할 수 없습니다.',
    patterns: Object.freeze([
      /(?:제거|삭제|생략|바꾸|교체|재배치|순서 변경|remove|delete|omit|replace|reorder)[\s\S]{0,36}(?:필수 섹션|출력 계약|출력 순서|10개|SEO|워드프레스 본문)/iu,
      /(?:필수 섹션|출력 계약|출력 순서|10개)[\s\S]{0,36}(?:제거|삭제|생략|교체|재배치|remove|delete|omit|replace|reorder)/iu,
    ]),
  }),
  Object.freeze({
    class: 'category-settings-override' as const,
    message: '활성 wrapper·표시 ID·slug 설정을 다른 값으로 지정할 수 없습니다.',
    patterns: Object.freeze([
      /(?:wrapper|래퍼|display[ -]?id|표시[ -]?id|slug|슬러그)[\s\S]{0,36}(?:대신|변경|바꾸|지정|사용해|replace|override|set to|use)/iu,
    ]),
  }),
  Object.freeze({
    class: 'chinese-id-generation' as const,
    message: '중국어 시리즈 번호·브리핑 ID·표시 ID를 생성하거나 추정할 수 없습니다.',
    patterns: Object.freeze([
      /(?:중국어|chinese|cctv|시리즈|series)[\s\S]{0,36}(?:번호|briefing[ -]?id|display[ -]?id|브리핑[ -]?id|표시[ -]?id)[\s\S]{0,24}(?:생성|추정|계산|증가|부여|guess|generate|increment|assign)/iu,
      /(?:생성|추정|계산|증가|부여|guess|generate|increment|assign)[\s\S]{0,24}(?:중국어|chinese|cctv|시리즈|series)[\s\S]{0,36}(?:번호|id)/iu,
    ]),
  }),
  Object.freeze({
    class: 'protected-data-disclosure' as const,
    message: '인증·소유자·UUID·credential 등 보호 정보를 노출할 수 없습니다.',
    patterns: Object.freeze([
      /(?:노출|공개|출력|포함|보여|reveal|expose|print|include|show)[\s\S]{0,36}(?:owner_?id|auth|session|email|token|credential|secret|uuid|서비스.?롤)/iu,
      /(?:owner_?id|auth|session|email|token|credential|secret|uuid|서비스.?롤)[\s\S]{0,36}(?:노출|공개|출력|포함|보여|reveal|expose|print|include|show)/iu,
    ]),
  }),
  Object.freeze({
    class: 'raw-html-context-insertion' as const,
    message: '원문 HTML 또는 컨텍스트 본문 전체를 삽입할 수 없습니다.',
    patterns: Object.freeze([
      /(?:원문|raw|context|컨텍스트|html_body|워드프레스)[\s\S]{0,36}(?:html|본문)[\s\S]{0,24}(?:삽입|복사|붙여|포함|insert|copy|embed|include)/iu,
      /(?:삽입|복사|붙여|포함|insert|copy|embed|include)[\s\S]{0,36}(?:html_body|raw html|원문 html|컨텍스트 본문)/iu,
    ]),
  }),
  Object.freeze({
    class: 'copyright-source-fabrication' as const,
    message: '전문·전체 자막·전체 번역 복제 또는 출처 조작 지시는 사용할 수 없습니다.',
    patterns: Object.freeze([
      /(?:기사 전문|원문 전문|전체 자막|전체 번역|full article|full transcript|full translation)[\s\S]{0,32}(?:복사|삽입|번역|재현|copy|include|reproduce)/iu,
      /(?:출처|source|cctv 표현)[\s\S]{0,32}(?:꾸며|조작|날조|fabricat|invent|make up)/iu,
    ]),
  }),
  Object.freeze({
    class: 'image-storage-or-html-prompt' as const,
    message: '이미지 업로드·저장 또는 HTML 내부 이미지 프롬프트 삽입을 요청할 수 없습니다.',
    patterns: Object.freeze([
      /(?:이미지|image)[\s\S]{0,28}(?:업로드|파일 저장|스토리지|버킷|upload|storage|bucket)/iu,
      /(?:이미지 프롬프트|image prompt)[\s\S]{0,28}(?:html|본문)[\s\S]{0,20}(?:삽입|포함|insert|include)/iu,
    ]),
  }),
  Object.freeze({
    class: 'external-write-or-publication' as const,
    message: 'DB·서버·WordPress 쓰기 또는 발행 작업을 요청할 수 없습니다.',
    patterns: Object.freeze([
      /(?:db|database|데이터베이스|서버|server|wordpress|워드프레스)[\s\S]{0,32}(?:저장|쓰기|수정|삭제|발행|게시|insert|update|delete|write|publish)/iu,
      /(?:저장|쓰기|수정|삭제|발행|게시|insert|update|delete|write|publish)[\s\S]{0,32}(?:db|database|데이터베이스|서버|server|wordpress|워드프레스)/iu,
    ]),
  }),
  Object.freeze({
    class: 'external-api-or-model-execution' as const,
    message: '외부 API 또는 AI 모델 실행을 요청할 수 없습니다.',
    patterns: Object.freeze([
      /(?:api|openai|chatgpt|claude|gemini|llm|ai 모델|외부 모델)[\s\S]{0,36}(?:호출|실행|전송|요청|call|run|execute|send)/iu,
      /(?:호출|실행|전송|요청|call|run|execute|send)[\s\S]{0,36}(?:api|openai|chatgpt|claude|gemini|llm|ai 모델|외부 모델)/iu,
    ]),
  }),
])

export function normalizeNonNewsPromptInput(value: string): string {
  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/gu, ' '))
    .join('\n')
    .trim()
}

export function getNonNewsCategoryRule(category: SupportedNonNewsCategoryId) {
  return NON_NEWS_CATEGORY_RULES[category]
}

export function findAdditionalInstructionConflicts(value: string) {
  const normalized = normalizeNonNewsPromptInput(value)
  if (!normalized) return []
  return ADDITIONAL_INSTRUCTION_CONFLICT_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(normalized)))
    .map((rule) => ({ class: rule.class, message: rule.message }))
}
