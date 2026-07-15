begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000004f01','restore-content@example.test'),('00000000-0000-0000-0000-000000004f02','restore-content-other@example.test');

create function public.test_restore_content_mappings() returns jsonb language sql immutable as $$ select '[{"sourceCategoryId":"economy","targetCategoryId":"economy","status":"compatible","target":{"contentGroup":"news","code":"ECO"}},{"sourceCategoryId":"ai-column","targetCategoryId":"ai-column","status":"compatible","target":{"contentGroup":"ai","code":"AI"}},{"sourceCategoryId":"info-db","targetCategoryId":"info-db","status":"compatible","target":{"contentGroup":"info_db","code":"INFO"}},{"sourceCategoryId":"chinese-study","targetCategoryId":"chinese-study","status":"compatible","target":{"contentGroup":"chinese","code":"CHINESE"}}]'::jsonb $$;
create function public.test_restore_content_job(p_hash text,p_count integer,p_timestamps text default 'preserve') returns uuid language sql set search_path='' as $$
 select (public.create_restore_job('daily-brief-note-backup',1,'core',p_hash,'daily-brief-note-restore-plan',1,1,repeat(substr(p_hash,1,1),64),repeat('f',64),'ready','content.json',jsonb_build_object('operationalHistory','exclude','timestamps',p_timestamps),public.test_restore_content_mappings(),'[]',p_count)->>'jobId')::uuid;
$$;
create function public.test_restore_content_record(p_section text,p_source text,p_target text,p_action text,p_stage integer,p_sequence integer,p_payload jsonb,p_dependencies jsonb default '[]') returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('section',p_section,'sourceId',p_source,'targetId',p_target,'action',p_action,'stageKey','stage-'||p_stage,'stageOrder',p_stage,'sequenceNo',p_sequence,'payload',p_payload,'payloadFingerprint',public.restore_payload_fingerprint(p_payload),'dependencies',p_dependencies,'safeDisplay',p_source);
$$;
create function public.test_restore_post_payload(p_category text,p_slug text,p_title text,p_series integer default null,p_briefing date default null,p_wordpress text default null) returns jsonb language sql immutable as $$
 select jsonb_build_object('categoryId',p_category,'seriesNo',p_series,'briefingDate',p_briefing,'publishedOn',coalesce(p_briefing,'2026-07-20'::date),'displayId',case when p_briefing is null then null else '#'||p_briefing::text||'-ECO' end,'title',p_title,'summary','summary','htmlBody','<article>body</article>','slug',p_slug,'wordpressUrl',p_wordpress,'contentStatus','draft','publishedAt',null,'sourceImportType','json_import','imagePrompt',null,'imageAlt',null,'imagePromptVersion',1,'imagePromptUpdatedAt',null,'createdAt','2026-07-15T01:02:03Z','updatedAt','2026-07-15T02:03:04Z');
$$;
create function public.test_run_restore_content_job(p_job uuid) returns integer language plpgsql set search_path='' as $$ declare r record; n integer:=0; begin for r in select id from public.restore_job_records where job_id=p_job order by stage_order,sequence_no loop perform public.run_restore_job_record(r.id); n:=n+1; end loop; return n; end $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004f01","role":"authenticated"}';
create temporary table content_jobs(name text primary key,id uuid);
insert into content_jobs values('main',public.test_restore_content_job(repeat('a',64),12));
select public.append_restore_job_records((select id from content_jobs where name='main'),jsonb_build_array(
 public.test_restore_content_record('tags','tag-preserve','4f100000-0000-0000-0000-000000000001','preserve_id',1,0,'{"name":"경제","normalizedName":"경제","createdAt":"2026-07-15T00:00:00Z"}'),
 public.test_restore_content_record('tags','tag-remap','4f100000-0000-0000-0000-000000000002','remap_id',1,1,'{"name":"기술","normalizedName":"기술","createdAt":"2026-07-15T00:00:00Z"}'),
 public.test_restore_content_record('posts','post-economy','4f200000-0000-0000-0000-000000000001','preserve_id',2,0,public.test_restore_post_payload('economy','restore-economy','경제 복원',null,'2026-07-20','https://example.test/economy'),'["category:economy"]'),
 public.test_restore_content_record('posts','post-ai','4f200000-0000-0000-0000-000000000002','remap_id',2,1,public.test_restore_post_payload('ai-column','restore-ai','AI 복원',1,null,'https://example.test/ai'),'["category:ai-column"]'),
 public.test_restore_content_record('posts','post-info','4f200000-0000-0000-0000-000000000003','preserve_id',2,2,public.test_restore_post_payload('info-db','restore-info','정보 복원',1,null,'https://example.test/info'),'["category:info-db"]'),
 public.test_restore_content_record('posts','post-chinese','4f200000-0000-0000-0000-000000000004','preserve_id',2,3,public.test_restore_post_payload('chinese-study','restore-chinese','중국어 복원',1,null,'https://example.test/chinese'),'["category:chinese-study"]'),
 public.test_restore_content_record('seoData','seo-economy',null,'create',3,0,'{"postId":"post-economy","representativeTitle":"대표 제목","alternativeTitles":["대안1","대안2"],"metaDescription":"설명","focusKeyword":"경제","createdAt":"2026-07-15T01:02:03Z","updatedAt":"2026-07-15T02:03:04Z"}','["posts:post-economy"]'),
 public.test_restore_content_record('aiMetadata','ai-meta',null,'create',3,1,'{"postId":"post-ai","fieldName":"AI","difficulty":"중급","estimatedReadMin":5}','["posts:post-ai"]'),
 public.test_restore_content_record('infoDbMetadata','info-meta',null,'create',3,2,'{"postId":"post-info","fieldName":"경제","difficulty":null,"estimatedReadMin":7,"referenceDate":"2026-07-14"}','["posts:post-info"]'),
 public.test_restore_content_record('chineseMetadata','chinese-meta',null,'create',3,3,'{"postId":"post-chinese","learningTopic":"중국 경제","programName":"新闻联播","originalTitle":"标题","originalUrl":"https://cctv.example/item-1","originalPublishedAt":null,"episodeListIncluded":false,"verifiedCoreFact":"확인","difficulty":null,"learningPoints":null}','["posts:post-chinese"]'),
 public.test_restore_content_record('postTags','relation',null,'create',4,0,'{"postId":"post-economy","tagId":"tag-remap"}','["posts:post-economy","tags:tag-remap"]'),
 public.test_restore_content_record('seriesCounters','counter-chinese',null,'create',5,0,'{"categoryId":"chinese-study","lastIssuedNo":2,"plannedLastIssuedNo":4,"updatedAt":"2026-07-15T02:03:04Z"}','["category:chinese-study"]')
));
select is((public.finalize_restore_job((select id from content_jobs where name='main'))->>'recordCount')::int,12,'1 content job finalizes all records');
select is(public.test_run_restore_content_job((select id from content_jobs where name='main')),12,'2 content records execute in stage sequence');
select is((select name from public.tags where id='4f100000-0000-0000-0000-000000000001'),'경제','3 tag preserve restores value');
select is((select name from public.tags where id='4f100000-0000-0000-0000-000000000002'),'기술','4 tag remap restores target');
select is((select owner_id from public.tags where id='4f100000-0000-0000-0000-000000000002'),'00000000-0000-0000-0000-000000004f01'::uuid,'5 tag owner injected');
select is((select slug from public.posts where id='4f200000-0000-0000-0000-000000000001'),'restore-economy','6 post preserve restores slug');
select is((select owner_id from public.posts where id='4f200000-0000-0000-0000-000000000001'),'00000000-0000-0000-0000-000000004f01'::uuid,'7 post owner injected');
select is((select html_body from public.posts where id='4f200000-0000-0000-0000-000000000001'),'<article>body</article>','8 post HTML restored');
select is((select created_at from public.posts where id='4f200000-0000-0000-0000-000000000001'),'2026-07-15T01:02:03Z'::timestamptz,'9 preserve timestamp retained');
select is((select representative_title from public.seo_data where post_id='4f200000-0000-0000-0000-000000000001'),'대표 제목','10 SEO restored');
select is((select alternative_titles from public.seo_data where post_id='4f200000-0000-0000-0000-000000000001'),'["대안1","대안2"]'::jsonb,'11 SEO alternative titles restored');
select is((select field_name from public.ai_metadata where post_id='4f200000-0000-0000-0000-000000000002'),'AI','12 AI metadata restored');
select is((select reference_date from public.info_db_metadata where post_id='4f200000-0000-0000-0000-000000000003'),'2026-07-14'::date,'13 info DB metadata restored');
select is((select original_url from public.chinese_metadata where post_id='4f200000-0000-0000-0000-000000000004'),'https://cctv.example/item-1','14 Chinese metadata URL restored');
select is((select episode_list_included from public.chinese_metadata where post_id='4f200000-0000-0000-0000-000000000004'),false,'15 false is preserved');
select is((select learning_points from public.chinese_metadata where post_id='4f200000-0000-0000-0000-000000000004'),null::text,'16 null is preserved');
select is((select tag_id from public.post_tags where post_id='4f200000-0000-0000-0000-000000000001'),'4f100000-0000-0000-0000-000000000002'::uuid,'17 postTag uses remapped tag');
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-000000004f01' and category_id='chinese-study'),4,'18 counter created at planned maximum');

insert into content_jobs values('counter-up',public.test_restore_content_job(repeat('b',64),1));
select public.append_restore_job_records((select id from content_jobs where name='counter-up'),jsonb_build_array(public.test_restore_content_record('seriesCounters','counter-up',null,'create',1,0,'{"categoryId":"chinese-study","lastIssuedNo":6,"plannedLastIssuedNo":6,"updatedAt":"2026-07-16T00:00:00Z"}','["category:chinese-study"]'))); select public.finalize_restore_job((select id from content_jobs where name='counter-up')); select public.test_run_restore_content_job((select id from content_jobs where name='counter-up'));
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-000000004f01' and category_id='chinese-study'),6,'19 counter increases');
insert into content_jobs values('counter-down',public.test_restore_content_job(repeat('c',64),1));
select public.append_restore_job_records((select id from content_jobs where name='counter-down'),jsonb_build_array(public.test_restore_content_record('seriesCounters','counter-down',null,'create',1,0,'{"categoryId":"chinese-study","lastIssuedNo":3,"plannedLastIssuedNo":3,"updatedAt":"2026-07-17T00:00:00Z"}','["category:chinese-study"]'))); select public.finalize_restore_job((select id from content_jobs where name='counter-down')); select public.test_run_restore_content_job((select id from content_jobs where name='counter-down'));
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-000000004f01' and category_id='chinese-study'),6,'20 counter never decreases');

insert into content_jobs values('slug-conflict',public.test_restore_content_job(repeat('d',64),1));
select public.append_restore_job_records((select id from content_jobs where name='slug-conflict'),jsonb_build_array(public.test_restore_content_record('posts','slug-conflict','4f200000-0000-0000-0000-000000000010','preserve_id',1,0,public.test_restore_post_payload('economy','restore-economy','slug conflict',null,'2026-07-21'),'["category:economy"]'))); select public.finalize_restore_job((select id from content_jobs where name='slug-conflict'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='slug-conflict')))->>'errorCode'),'RESTORE_UNIQUE_KEY_CONFLICT','21 slug conflict blocked');
select is((select count(*)::int from public.posts where id='4f200000-0000-0000-0000-000000000010'),0,'22 slug failure rolls back domain row');

insert into content_jobs values('wordpress-conflict',public.test_restore_content_job(repeat('e',64),1));
select public.append_restore_job_records((select id from content_jobs where name='wordpress-conflict'),jsonb_build_array(public.test_restore_content_record('posts','wordpress-conflict','4f200000-0000-0000-0000-000000000011','preserve_id',1,0,public.test_restore_post_payload('economy','wordpress-new','wordpress conflict',null,'2026-07-22','https://example.test/economy'),'["category:economy"]'))); select public.finalize_restore_job((select id from content_jobs where name='wordpress-conflict'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='wordpress-conflict')))->>'errorCode'),'RESTORE_UNIQUE_KEY_CONFLICT','23 WordPress URL conflict blocked');

insert into content_jobs values('briefing-conflict',public.test_restore_content_job(repeat('5',64),1));
select public.append_restore_job_records((select id from content_jobs where name='briefing-conflict'),jsonb_build_array(public.test_restore_content_record('posts','briefing-conflict','4f200000-0000-0000-0000-000000000012','preserve_id',1,0,public.test_restore_post_payload('economy','briefing-new','briefing conflict',null,'2026-07-20'),'["category:economy"]'))); select public.finalize_restore_job((select id from content_jobs where name='briefing-conflict'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='briefing-conflict')))->>'errorCode'),'RESTORE_UNIQUE_KEY_CONFLICT','24 news briefing unique conflict blocked');

insert into content_jobs values('series-conflict',public.test_restore_content_job(repeat('6',64),1));
select public.append_restore_job_records((select id from content_jobs where name='series-conflict'),jsonb_build_array(public.test_restore_content_record('posts','series-conflict','4f200000-0000-0000-0000-000000000013','preserve_id',1,0,public.test_restore_post_payload('ai-column','series-new','series conflict',1),'["category:ai-column"]'))); select public.finalize_restore_job((select id from content_jobs where name='series-conflict'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='series-conflict')))->>'errorCode'),'RESTORE_UNIQUE_KEY_CONFLICT','25 series unique conflict blocked');

insert into content_jobs values('category-mismatch',public.test_restore_content_job(repeat('7',64),2));
select public.append_restore_job_records((select id from content_jobs where name='category-mismatch'),jsonb_build_array(public.test_restore_content_record('posts','wrong-meta-post','4f200000-0000-0000-0000-000000000014','preserve_id',1,0,public.test_restore_post_payload('economy','wrong-meta','wrong meta',null,'2026-07-23'),'["category:economy"]'),public.test_restore_content_record('aiMetadata','wrong-meta',null,'create',2,0,'{"postId":"wrong-meta-post","fieldName":"AI","difficulty":"초급","estimatedReadMin":3}','["posts:wrong-meta-post"]'))); select public.finalize_restore_job((select id from content_jobs where name='category-mismatch')); select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='category-mismatch') and section='posts'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='category-mismatch') and section='aiMetadata'))->>'errorCode'),'RESTORE_CATEGORY_MISMATCH','26 metadata category mismatch blocked');
select is((select status from public.restore_job_records where job_id=(select id from content_jobs where name='category-mismatch') and section='aiMetadata'),'failed','27 metadata failure state retained');
select is((select count(*)::int from public.ai_metadata where post_id='4f200000-0000-0000-0000-000000000014'),0,'28 metadata failure writes no domain row');

insert into content_jobs values('normalized-conflict',public.test_restore_content_job(repeat('8',64),1));
select public.append_restore_job_records((select id from content_jobs where name='normalized-conflict'),jsonb_build_array(public.test_restore_content_record('tags','normalized-conflict','4f100000-0000-0000-0000-000000000010','preserve_id',1,0,'{"name":"기술","normalizedName":"기술","createdAt":"2026-07-15T00:00:00Z"}'))); select public.finalize_restore_job((select id from content_jobs where name='normalized-conflict'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from content_jobs where name='normalized-conflict')))->>'errorCode'),'RESTORE_UNIQUE_KEY_CONFLICT','29 normalized tag unique conflict blocked');

insert into content_jobs values('default-time',public.test_restore_content_job(repeat('9',64),1,'database_default'));
select public.append_restore_job_records((select id from content_jobs where name='default-time'),jsonb_build_array(public.test_restore_content_record('tags','default-time','4f100000-0000-0000-0000-000000000011','preserve_id',1,0,'{"name":"현재시각","normalizedName":"현재시각","createdAt":"2000-01-01T00:00:00Z"}'))); select public.finalize_restore_job((select id from content_jobs where name='default-time')); select public.test_run_restore_content_job((select id from content_jobs where name='default-time'));
select ok((select created_at > '2026-01-01'::timestamptz from public.tags where id='4f100000-0000-0000-0000-000000000011'),'30 database default timestamp used');

set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004f02","role":"authenticated"}';
insert into content_jobs values('other-counter',public.test_restore_content_job(repeat('0',64),1));
select public.append_restore_job_records((select id from content_jobs where name='other-counter'),jsonb_build_array(public.test_restore_content_record('seriesCounters','other-counter',null,'create',1,0,'{"categoryId":"chinese-study","lastIssuedNo":9,"plannedLastIssuedNo":9,"updatedAt":"2026-07-18T00:00:00Z"}','["category:chinese-study"]'))); select public.finalize_restore_job((select id from content_jobs where name='other-counter')); select public.test_run_restore_content_job((select id from content_jobs where name='other-counter'));
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-000000004f02' and category_id='chinese-study'),9,'31 counter isolated by user');
select is((select count(*)::int from public.posts where id='4f200000-0000-0000-0000-000000000001'),0,'32 other user cannot read restored post');

select * from finish();
rollback;
