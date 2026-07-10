insert into public.categories (
  id,
  content_group,
  name,
  code,
  wrapper_class,
  display_id_pattern,
  slug_pattern,
  sort_order,
  enabled
)
values
  (
    'economy',
    'news',
    '경제',
    'ECO',
    'daily-brief-note news-briefing economy',
    '#YYYY-MM-DD-ECO',
    'economy-briefing-YYYY-MM-DD',
    10,
    true
  ),
  (
    'global',
    'news',
    '국제',
    'GLO',
    'daily-brief-note news-briefing global',
    '#YYYY-MM-DD-GLO',
    'global-briefing-YYYY-MM-DD',
    20,
    true
  ),
  (
    'technology',
    'news',
    '과학기술',
    'TEC',
    'daily-brief-note news-briefing technology',
    '#YYYY-MM-DD-TEC',
    'technology-briefing-YYYY-MM-DD',
    30,
    true
  ),
  (
    'society',
    'news',
    '사회',
    'SOC',
    'daily-brief-note news-briefing society',
    '#YYYY-MM-DD-SOC',
    'society-briefing-YYYY-MM-DD',
    40,
    true
  ),
  (
    'climate-energy',
    'news',
    '환경·에너지',
    'ENV',
    'daily-brief-note news-briefing climate-energy',
    '#YYYY-MM-DD-ENV',
    'climate-energy-briefing-YYYY-MM-DD',
    50,
    true
  ),
  (
    'ai-column',
    'ai',
    'AI 칼럼',
    'AI',
    'daily-brief-note ai-column',
    'AI-###',
    'ai-###',
    60,
    true
  ),
  (
    'info-db',
    'info_db',
    '정보DB',
    'INFO',
    'daily-brief-note info-db',
    '정보DB-###',
    'info-db-###',
    70,
    true
  ),
  (
    'chinese-study',
    'chinese',
    '중국어 학습',
    'CHINESE',
    'daily-brief-note chinese-study',
    null,
    'cctv-chinese-news-study-###',
    80,
    true
  )
on conflict (id) do update
set
  content_group = excluded.content_group,
  name = excluded.name,
  code = excluded.code,
  wrapper_class = excluded.wrapper_class,
  display_id_pattern = excluded.display_id_pattern,
  slug_pattern = excluded.slug_pattern,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = now();
