# 02. 워드프레스 HTML 최종 템플릿  
  
## 1. 공통 HTML 규칙  
  
- 본문은 HTML로 작성한다.  
- 본문 전체를 하나의 연속된 HTML 코드블록으로 출력한다.  
- HTML 본문 안에 ==<h1>==을 포함한다.  
- wrapper 시작 태그와 마지막 ==</div>==를 모두 포함한다.  
- Markdown 문법과 HTML을 혼용하지 않는다.  
- 외부 링크에는 필요 시 ==target="_blank"==와 ==rel="noopener"==를 사용한다.  
- 동일한 ==id== 값을 한 문서에서 중복 사용하지 않는다.  
- 대표 이미지 프롬프트와 SEO 정보는 HTML 밖에 배치한다.  
⸻  
# 2. 뉴스 브리핑 템플릿  
  
```html
<div class="daily-brief-note news-briefing">

  <h1>[날짜] [카테고리] 뉴스 브리핑｜[핵심 제목]</h1>

  <p class="intro">
    [오늘 브리핑의 핵심 흐름을 2~3문장으로 요약]
  </p>

  <section class="brief-meta">
    <p><strong>작성일:</strong> [YYYY년 MM월 DD일]</p>
    <p><strong>브리핑 ID:</strong> [NEWS-YYYYMMDD-CODE]</p>
    <p><strong>작성 기준:</strong> [확인 시각과 조사 범위]</p>
  </section>

  <section class="summary-box">
    <h2>오늘의 핵심 요약</h2>
    <ul>
      <li>[핵심 요약 1]</li>
      <li>[핵심 요약 2]</li>
      <li>[핵심 요약 3]</li>
    </ul>
  </section>

  <h2 id="toc">목차</h2>
  <ol>
    <li><a href="#issue-1">[뉴스 1 제목]</a></li>
    <li><a href="#issue-2">[뉴스 2 제목]</a></li>
    <li><a href="#connections">뉴스 간 연결성</a></li>
    <li><a href="#watch-points">앞으로 볼 포인트</a></li>
    <li><a href="#sources">출처</a></li>
  </ol>

  <section id="issue-1">
    <h2>1. [뉴스 제목]</h2>

    <p class="update-label">
      [신규 또는 업데이트｜이전 브리핑 ID 후속]
    </p>

    <h3>무엇이 있었나</h3>
    <p>[확인된 사실]</p>

    <h3>왜 중요한가</h3>
    <p>[정책적·산업적·사회적 의미]</p>

    <h3>우리에게 미치는 영향</h3>
    <p>[독자 또는 시장에 미칠 수 있는 영향]</p>

    <h3>앞으로 볼 포인트</h3>
    <p>[확인해야 할 일정·지표·후속 발표]</p>
  </section>

  <section id="issue-2">
    <h2>2. [뉴스 제목]</h2>
    <h3>무엇이 있었나</h3>
    <p>[내용]</p>
    <h3>왜 중요한가</h3>
    <p>[내용]</p>
    <h3>우리에게 미치는 영향</h3>
    <p>[내용]</p>
    <h3>앞으로 볼 포인트</h3>
    <p>[내용]</p>
  </section>

  <section id="connections">
    <h2>뉴스 간 연결성</h2>
    <p>[정책·산업·시장·사회 흐름에서의 연결성]</p>
  </section>

  <section id="change-log">
    <h2>이전 브리핑과 달라진 점</h2>
    <ul>
      <li>[신규 추가 사항]</li>
      <li>[의미 있는 후속 변화]</li>
      <li>[제외한 중복 또는 변경 없는 이슈]</li>
    </ul>
  </section>

  <section id="watch-points">
    <h2>앞으로 확인할 핵심 포인트</h2>
    <ul>
      <li>[확인 포인트 1]</li>
      <li>[확인 포인트 2]</li>
      <li>[확인 포인트 3]</li>
    </ul>
  </section>

  <section id="faq">
    <h2>자주 묻는 질문</h2>

    <h3>[질문 1]</h3>
    <p>[답변]</p>

    <h3>[질문 2]</h3>
    <p>[답변]</p>

    <h3>[질문 3]</h3>
    <p>[답변]</p>
  </section>

  <section id="sources">
    <h2>출처 및 참고자료</h2>
    <ul>
      <li>
        <a href="[개별 원문 URL]" target="_blank" rel="noopener">
          [기관·언론사]｜[원문 제목]
        </a>
        — [게시일 또는 업데이트일], [확인한 핵심 내용]
      </li>
    </ul>
  </section>

  <section id="previous-briefing">
    <h2>이전 브리핑</h2>
    <p><a href="[내부 링크]">[이전 관련 브리핑 제목]</a></p>
  </section>

  <p class="content-note">
    이 글은 공개된 공식 자료와 신뢰할 수 있는 보도를 바탕으로 핵심 내용을 독립적으로 재구성한 뉴스 브리핑입니다.<br>Writer by <strong>Daily Brief Note</strong>
  </p>

</div>

```
  
⸻  
# 3. AI 칼럼 템플릿  
  
```html
<div class="daily-brief-note ai-column">

  <h1>[글 제목]</h1>

  <p class="intro">
    [핵심 키워드를 포함해 글의 목적과 독자가 알게 될 내용을 설명]
  </p>

  <section class="summary-box">
    <h2>핵심 요약</h2>
    <ul>
      <li>[핵심 개념 1]</li>
      <li>[핵심 개념 2]</li>
      <li>[핵심 개념 3]</li>
    </ul>
  </section>

  <section class="brief-meta">
    <p><strong>작성일:</strong> [YYYY년 MM월 DD일]</p>
    <p><strong>작성 기준:</strong> [최신 정보 확인 기준일]</p>
    <p><strong>시리즈 ID:</strong> [AI-###]</p>
  </section>

  <section class="content-meta">
    <table>
      <tbody>
        <tr>
          <th>분야</th>
          <td>[생성형 AI / AI 에이전트 / 피지컬 AI 등]</td>
        </tr>
        <tr>
          <th>난이도</th>
          <td>[입문 / 기초 / 중급]</td>
        </tr>
        <tr>
          <th>예상 읽기 시간</th>
          <td>[약 N분]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <h2 id="toc">목차</h2>
  <ol>
    <li><a href="#definition">개념 정의</a></li>
    <li><a href="#how-it-works">작동 원리</a></li>
    <li><a href="#comparison">비슷한 개념과 차이</a></li>
    <li><a href="#examples">활용 사례</a></li>
    <li><a href="#limits">한계와 주의점</a></li>
    <li><a href="#faq">FAQ</a></li>
    <li><a href="#sources">출처</a></li>
  </ol>

  <section id="definition">
    <h2>[개념]이란 무엇인가</h2>
    <p>[초보자 중심 정의]</p>
  </section>

  <section id="how-it-works">
    <h2>어떻게 작동하는가</h2>
    <p>[단계별 작동 원리]</p>
  </section>

  <section id="comparison">
    <h2>비슷한 개념과 무엇이 다른가</h2>
    <table>
      <thead>
        <tr>
          <th>구분</th>
          <th>[개념 A]</th>
          <th>[개념 B]</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>목적</th>
          <td>[내용]</td>
          <td>[내용]</td>
        </tr>
        <tr>
          <th>작동 방식</th>
          <td>[내용]</td>
          <td>[내용]</td>
        </tr>
        <tr>
          <th>대표 활용</th>
          <td>[내용]</td>
          <td>[내용]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section id="examples">
    <h2>실제 활용 사례</h2>
    <h3>[사례 1]</h3>
    <p>[설명]</p>
    <h3>[사례 2]</h3>
    <p>[설명]</p>
  </section>

  <section id="benefits">
    <h2>기대할 수 있는 장점</h2>
    <ul>
      <li>[장점 1]</li>
      <li>[장점 2]</li>
      <li>[장점 3]</li>
    </ul>
  </section>

  <section id="limits">
    <h2>한계와 주의점</h2>
    <ul>
      <li>[기술적 한계]</li>
      <li>[보안·개인정보 위험]</li>
      <li>[검증과 인간 감독의 필요성]</li>
    </ul>
  </section>

  <section id="future">
    <h2>앞으로 무엇이 달라질까</h2>
    <p>[확정된 개발 방향과 전망을 구분해 설명]</p>
  </section>

  <section id="faq">
    <h2>자주 묻는 질문</h2>
    <h3>[질문 1]</h3>
    <p>[답변]</p>
    <h3>[질문 2]</h3>
    <p>[답변]</p>
    <h3>[질문 3]</h3>
    <p>[답변]</p>
  </section>

  <section id="sources">
    <h2>출처 및 참고자료</h2>
    <ul>
      <li>
        <a href="[URL]" target="_blank" rel="noopener">
          [기관명]｜[자료 제목]
        </a>
        — [게시일 또는 확인일]
      </li>
    </ul>
  </section>

  <section id="previous-ai-column">
    <h2>이전 AI 칼럼</h2>
    <p><a href="[내부 링크]">[이전 글 제목]</a></p>
  </section>

  <p class="series-id"><strong>AI 칼럼 ID:</strong> [AI-###]</p>

  <p class="content-note">
    이 글은 AI 기술을 처음 접하는 독자가 핵심 개념과 실제 활용 범위를 이해할 수 있도록 공식 자료와 신뢰할 수 있는 연구를 바탕으로 구성했습니다.<br>Writer by <strong>Daily Brief Note</strong>
  </p>

</div>

```
  
⸻  
# 4. 정보DB 템플릿  
  
```html
<div class="daily-brief-note info-db">

  <h1>[정보DB 제목]</h1>

  <p class="intro">
    [핵심 키워드와 글의 목적을 포함한 첫 문단]
  </p>

  <section class="summary-box">
    <h2>핵심 요약</h2>
    <ul>
      <li>[핵심 정의]</li>
      <li>[핵심 원리]</li>
      <li>[독자가 기억해야 할 내용]</li>
    </ul>
  </section>

  <section class="brief-meta">
    <p><strong>작성일:</strong> [YYYY년 MM월 DD일]</p>
    <p><strong>작성 기준:</strong> [정보 확인 기준일]</p>
    <p><strong>정보DB ID:</strong> [정보DB-###]</p>
  </section>

  <section class="content-meta">
    <table>
      <tbody>
        <tr>
          <th>분야</th>
          <td>[과학 / 기술 / 경제 / 산업 / 사회 등]</td>
        </tr>
        <tr>
          <th>난이도</th>
          <td>[입문 / 기초 / 중급]</td>
        </tr>
        <tr>
          <th>예상 읽기 시간</th>
          <td>[약 N분]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <h2 id="toc">목차</h2>
  <ol>
    <li><a href="#definition">정의</a></li>
    <li><a href="#principle">핵심 원리</a></li>
    <li><a href="#components">구성 요소</a></li>
    <li><a href="#comparison">유사 개념 비교</a></li>
    <li><a href="#examples">실제 사례</a></li>
    <li><a href="#misconceptions">흔한 오해</a></li>
    <li><a href="#faq">FAQ</a></li>
    <li><a href="#sources">출처</a></li>
  </ol>

  <section id="definition">
    <h2>[개념]이란 무엇인가</h2>
    <p>[명확하고 짧은 정의]</p>
  </section>

  <section id="principle">
    <h2>핵심 원리</h2>
    <p>[원리를 단계적으로 설명]</p>
  </section>

  <section id="components">
    <h2>주요 구성 요소</h2>
    <h3>[구성 요소 1]</h3>
    <p>[설명]</p>
    <h3>[구성 요소 2]</h3>
    <p>[설명]</p>
  </section>

  <section id="comparison">
    <h2>비슷한 개념과 비교</h2>
    <table>
      <thead>
        <tr>
          <th>구분</th>
          <th>[개념 A]</th>
          <th>[개념 B]</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>정의</th>
          <td>[내용]</td>
          <td>[내용]</td>
        </tr>
        <tr>
          <th>핵심 특징</th>
          <td>[내용]</td>
          <td>[내용]</td>
        </tr>
        <tr>
          <th>활용 분야</th>
          <td>[내용]</td>
          <td>[내용]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section id="examples">
    <h2>실제 사례</h2>
    <ul>
      <li>[사례 1]</li>
      <li>[사례 2]</li>
      <li>[사례 3]</li>
    </ul>
  </section>

  <section id="misconceptions">
    <h2>흔히 오해하는 부분</h2>
    <h3>오해 1. [오해 내용]</h3>
    <p>[정확한 설명]</p>
    <h3>오해 2. [오해 내용]</h3>
    <p>[정확한 설명]</p>
  </section>

  <section id="key-points">
    <h2>핵심 정리</h2>
    <ul>
      <li>[정리 1]</li>
      <li>[정리 2]</li>
      <li>[정리 3]</li>
    </ul>
  </section>

  <section id="faq">
    <h2>자주 묻는 질문</h2>
    <h3>[질문 1]</h3>
    <p>[답변]</p>
    <h3>[질문 2]</h3>
    <p>[답변]</p>
    <h3>[질문 3]</h3>
    <p>[답변]</p>
  </section>

  <section id="sources">
    <h2>출처 및 참고자료</h2>
    <ul>
      <li>
        <a href="[URL]" target="_blank" rel="noopener">
          [기관명]｜[자료 제목]
        </a>
        — [게시일 또는 확인일]
      </li>
    </ul>
  </section>

  <section id="previous-info-db">
    <h2>이전 정보DB</h2>
    <p><a href="[내부 링크]">[이전 글 제목]</a></p>
  </section>

  <p class="series-id"><strong>정보DB ID:</strong> [정보DB-###]</p>

  <p class="content-note">
    이 글은 복잡한 개념을 쉽게 이해할 수 있도록 공식 자료와 신뢰할 수 있는 참고문헌을 바탕으로 정리한 정보DB 콘텐츠입니다.<br>Writer by <strong>Daily Brief Note</strong>
  </p>

</div>

```
  
⸻  
# 5. 중국어 학습 템플릿  
  
```html
<div class="daily-brief-note chinese-study">

  <h1>CCTV 뉴스로 배우는 중국어 #[번호]｜[뉴스 주제] 핵심 표현 정리</h1>

  <p class="intro">
    이 글은 CCTV 뉴스 원문을 바탕으로 중국어 문장, 병음, 한국어 해석, 핵심 단어와 실생활 표현을 함께 정리한 학습 콘텐츠입니다. 오늘은 [뉴스 주제]와 관련된 핵심 표현을 살펴봅니다.
  </p>

  <section class="summary-box">
    <h2>오늘의 학습 요약</h2>
    <ul>
      <li>[핵심 표현 1]</li>
      <li>[핵심 표현 2]</li>
      <li>[핵심 표현 3]</li>
    </ul>
  </section>

  <section class="content-meta">
    <table>
      <tbody>
        <tr>
          <th>학습 주제</th>
          <td>[경제 / 사회 / 과학기술 / 문화 / 외교 등]</td>
        </tr>
        <tr>
          <th>뉴스 출처</th>
          <td>[CCTV 프로그램명]</td>
        </tr>
        <tr>
          <th>난이도</th>
          <td>[초급 / 중급 / 고급]</td>
        </tr>
        <tr>
          <th>핵심 학습 포인트</th>
          <td>[단어 / 문장 구조 / 뉴스 표현 / 업무 표현]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <h2 id="toc">목차</h2>
  <ol>
    <li><a href="#news-summary">뉴스 내용 요약</a></li>
    <li><a href="#key-sentences">핵심 문장 분석</a></li>
    <li><a href="#vocabulary">중요 단어</a></li>
    <li><a href="#grammar">문장 구조</a></li>
    <li><a href="#practical-expressions">실생활 응용 표현</a></li>
    <li><a href="#quiz">복습 퀴즈</a></li>
    <li><a href="#source-check">출처 확인</a></li>
  </ol>

  <section id="news-summary">
    <h2>뉴스 내용 요약</h2>
    <p>[기사 전문을 복사하지 않고 뉴스의 배경과 핵심 내용을 한국어로 요약]</p>
  </section>

  <section id="key-sentences">
    <h2>핵심 문장 분석</h2>

    <article class="sentence-card">
      <h3>문장 1</h3>
      <p class="chinese-sentence"><strong>[중국어 원문]</strong></p>
      <p class="pinyin">[성조 포함 병음]</p>
      <p class="translation"><strong>한국어 해석:</strong> [자연스러운 해석]</p>

      <h4>기본 문장 구조</h4>
      <table>
        <tbody>
          <tr><th>주어</th><td>[주어]</td></tr>
          <tr><th>술어</th><td>[술어]</td></tr>
          <tr><th>목적어</th><td>[목적어]</td></tr>
          <tr><th>부사어·보어</th><td>[해당 내용]</td></tr>
        </tbody>
      </table>

      <h4>핵심 표현</h4>
      <ul>
        <li><strong>[표현]</strong> — [병음] — [뜻] — 활용도 [⭐⭐⭐⭐]</li>
      </ul>

      <h4>실생활 응용</h4>
      <p><strong>[응용 중국어 문장]</strong></p>
      <p>[성조 포함 병음]</p>
      <p>[한국어 해석]</p>
    </article>
  </section>

  <section id="vocabulary">
    <h2>중요 단어 정리</h2>
    <table>
      <thead>
        <tr>
          <th>중국어</th>
          <th>병음</th>
          <th>한국어 뜻</th>
          <th>사용 빈도</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>[단어]</td>
          <td>[병음]</td>
          <td>[뜻]</td>
          <td>[⭐⭐⭐⭐]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section id="grammar">
    <h2>문장 구조 정리</h2>

    <h3>구조 1. [구조명]</h3>
    <p><strong>형식:</strong> [중국어 구조]</p>
    <p><strong>의미:</strong> [한국어 설명]</p>
    <p><strong>예문:</strong> [중국어 예문]</p>
    <p>[병음]</p>
    <p>[한국어 해석]</p>
  </section>

  <section id="practical-expressions">
  <h2>실생활 응용 표현</h2>

  <article class="sentence-card">
    <h3>1) 직장 대화</h3>

    <p class="chinese-sentence"><strong>[직장 대화 중국어 문장]</strong></p>

    <p class="pinyin">[성조 포함 병음]</p>

    <p class="translation"><strong>한국어 해석:</strong> [자연스러운 한국어 해석]</p>

    <h4>핵심 표현</h4>
    <ul>
      <li><strong>[핵심 표현 1]</strong>: [한국어 의미] ⭐⭐⭐⭐⭐</li>
      <li><strong>[핵심 표현 2]</strong>: [한국어 의미] ⭐⭐⭐⭐</li>
    </ul>
  </article>

  <article class="sentence-card">
    <h3>2) 위챗 채팅</h3>

    <p class="chinese-sentence"><strong>[위챗 채팅 중국어 문장]</strong></p>

    <p class="pinyin">[성조 포함 병음]</p>

    <p class="translation"><strong>한국어 해석:</strong> [자연스러운 한국어 해석]</p>

    <h4>핵심 표현</h4>
    <ul>
      <li><strong>[핵심 표현 1]</strong>: [한국어 의미] ⭐⭐⭐⭐⭐</li>
      <li><strong>[핵심 표현 2]</strong>: [한국어 의미] ⭐⭐⭐⭐</li>
    </ul>
  </article>

  <article class="sentence-card">
    <h3>3) 고객 응대</h3>

    <p class="chinese-sentence"><strong>[고객 응대 중국어 문장]</strong></p>

    <p class="pinyin">[성조 포함 병음]</p>

    <p class="translation"><strong>한국어 해석:</strong> [자연스러운 한국어 해석]</p>

    <h4>핵심 표현</h4>
    <ul>
      <li><strong>[핵심 표현 1]</strong>: [한국어 의미] ⭐⭐⭐⭐⭐</li>
      <li><strong>[핵심 표현 2]</strong>: [한국어 의미] ⭐⭐⭐⭐</li>
    </ul>
  </article>

  <article class="sentence-card">
    <h3>4) 일상 대화</h3>

    <p class="chinese-sentence"><strong>[일상 대화 중국어 문장]</strong></p>

    <p class="pinyin">[성조 포함 병음]</p>

    <p class="translation"><strong>한국어 해석:</strong> [자연스러운 한국어 해석]</p>

    <h4>핵심 표현</h4>
    <ul>
      <li><strong>[핵심 표현 1]</strong>: [한국어 의미] ⭐⭐⭐⭐⭐</li>
      <li><strong>[핵심 표현 2]</strong>: [한국어 의미] ⭐⭐⭐⭐</li>
    </ul>
  </article>

  <article class="sentence-card">
    <h3>5) [뉴스 주제별 응용 상황]</h3>

    <p class="chinese-sentence"><strong>[주제별 응용 중국어 문장]</strong></p>

    <p class="pinyin">[성조 포함 병음]</p>

    <p class="translation"><strong>한국어 해석:</strong> [자연스러운 한국어 해석]</p>

    <h4>핵심 표현</h4>
    <ul>
      <li><strong>[핵심 표현 1]</strong>: [한국어 의미] ⭐⭐⭐⭐⭐</li>
      <li><strong>[핵심 표현 2]</strong>: [한국어 의미] ⭐⭐⭐⭐</li>
    </ul>
  </article>
</section>
  <section id="quiz">
    <h2>복습 퀴즈</h2>

    <h3>Q1. [문제]</h3>
    <details>
      <summary>정답 확인</summary>
      <p>[정답과 설명]</p>
    </details>

    <h3>Q2. [문제]</h3>
    <details>
      <summary>정답 확인</summary>
      <p>[정답과 설명]</p>
    </details>

    <h3>Q3. [문제]</h3>
    <details>
      <summary>정답 확인</summary>
      <p>[정답과 설명]</p>
    </details>
  </section>

  <section id="source-check">
    <h2>출처 확인</h2>
    <table>
      <tbody>
        <tr>
          <th>프로그램명</th>
          <td>[CCTV 프로그램명]</td>
        </tr>
        <tr>
          <th>원문 제목</th>
          <td>[중국어 원문 제목]</td>
        </tr>
        <tr>
          <th>게시·업데이트 시간</th>
          <td>[중국 표준시 기준 시간]</td>
        </tr>
        <tr>
          <th>개별 원문</th>
          <td>
            <a href="[개별 기사 또는 영상 URL]" target="_blank" rel="noopener">
              CCTV 원문 확인
            </a>
          </td>
        </tr>
        <tr>
          <th>본편 목록 포함 여부</th>
          <td>[확인 결과]</td>
        </tr>
        <tr>
          <th>확인한 핵심 내용</th>
          <td>[학습 문장이 실제 원문에 존재함을 설명]</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section id="previous-chinese-study">
    <h2>이전 학습 콘텐츠</h2>
    <p><a href="[내부 링크]">[이전 중국어 학습 글 제목]</a></p>
  </section>

  <p class="content-note">
    뉴스 문장은 공식 원문의 핵심 부분만 학습 목적으로 인용했으며, 전체 내용은 CCTV 원문 페이지에서 확인할 수 있습니다.<br>Writer by <strong>Daily Brief Note</strong>
  </p>

</div>

```
