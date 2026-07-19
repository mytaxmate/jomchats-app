-- ============================================================================
-- JomChats · Aurum pilot — seed data (BUILD_PLAN §1.2, §9, §11)
-- Single tenant for the pilot. Fixed tenant_id → matches TENANT_ID env var.
-- Run AFTER 0001_init.sql. Idempotent-ish: safe to re-run (on conflict do nothing).
-- ============================================================================

-- Fixed pilot tenant id
--   TENANT_ID = 11111111-1111-1111-1111-111111111111

-- ---- Settings (persona, hours, shadow default ON until go-live) -------------
insert into settings (tenant_id, config) values (
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object(
    'client_name', 'Kim Realty',
    'project_name', 'AURUM @ Bandar Sunway',
    'persona_name', 'Aisha',
    'languages', array['en','ms','zh'],
    'manglish', true,
    'emoji_level', 'light',
    'business_hours', jsonb_build_object('tz','Asia/Kuala_Lumpur','days',array[1,2,3,4,5,6,7],'start','09:00','end','21:00'),
    'shadow', true,
    'budget_usd_daily', 5,
    'answer_model', 'ANSWER_MODEL',
    'fast_model', 'FAST_MODEL'
  )
) on conflict (tenant_id) do nothing;

-- ---- Staff (YY = pilot owner / admin) --------------------------------------
insert into staff (tenant_id, name, email, role, alert_order) values
  ('11111111-1111-1111-1111-111111111111', 'YY', 'limyuehyih@gmail.com', 'admin', 1)
on conflict do nothing;

-- ---- Booking types (§9) — gallery hours [ASK YY/client] to confirm ---------
insert into booking_types (tenant_id, name, duration_min, capacity_per_slot, open_rule) values
  ('11111111-1111-1111-1111-111111111111', 'Sales gallery visit', 30, 4,
   '{"days":[2,3,4,5,6,7],"start":"10:00","end":"18:00","slot_every":30,"tz":"Asia/Kuala_Lumpur"}'::jsonb),
  ('11111111-1111-1111-1111-111111111111', 'Callback', 15, 1,
   '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00","slot_every":15,"tz":"Asia/Kuala_Lumpur"}'::jsonb)
on conflict do nothing;

-- ---- kb_facts (F01–F20) — human-verified, numbers pinned -------------------
insert into kb_facts (tenant_id, key, value, numeric_values, disclaimer, source, question_forms, active, verified_at) values
('11111111-1111-1111-1111-111111111111','developer',
 'The developer is Kiranamaz Property Sdn Bhd (Unit 14-2, Medan Klang Lama 28, No. 419, Jalan Kelang Lama, 58000 KL).',
 '{}', null, 'FAQ p1, brochure p9', array['who is the developer','developer','pemaju','siapa developer'], true, now()),

('11111111-1111-1111-1111-111111111111','project.name',
 'The project is AURUM @ Bandar Sunway (name subject to authority approval).',
 '{}', 'Name subject to authority approval.', 'FAQ p1', array['project name','what is this project','nama projek'], true, now()),

('11111111-1111-1111-1111-111111111111','location',
 'AURUM is located along Jalan PJS 9/1 – Jalan Taylors, Bandar Sunway.',
 '{}', null, 'FAQ p1', array['where is it','location','di mana','address','how to go'], true, now()),

('11111111-1111-1111-1111-111111111111','tenure',
 'The tenure is Leasehold.',
 '{}', null, 'FAQ p1', array['tenure','freehold or leasehold','freehold ke leasehold','pegangan'], true, now()),

('11111111-1111-1111-1111-111111111111','land.size',
 'The land is approximately 9.428 acres overall; nett 7.84 acres after surrender.',
 '{9.428,7.84}', null, 'FAQ p1', array['land size','how big is the land','saiz tanah','how many acres'], true, now()),

('11111111-1111-1111-1111-111111111111','units.total',
 'There are 734 units in 1 block, with 44 residential levels (roof at Level 45, about 149 m tall).',
 '{734,1,44,45,149}', null, 'FAQ p1', array['how many units','how tall','how many floors','how many levels','berapa unit','berapa tingkat'], true, now()),

('11111111-1111-1111-1111-111111111111','units.per_floor',
 '21 units per floor (Left wing 9, Right wing 12).',
 '{21,9,12}', null, 'FAQ p1', array['units per floor','how many units per floor','unit setiap tingkat'], true, now()),

('11111111-1111-1111-1111-111111111111','lifts',
 'There are 4 passenger lifts plus 1 bomba (fire) lift.',
 '{4,1}', null, 'FAQ p1', array['how many lifts','lifts','lif','elevator'], true, now()),

('11111111-1111-1111-1111-111111111111','levels',
 'Level 1: lobby, tadika, management office, mailboxes, shops. Levels 2–8: carpark. Level 9: facilities podium. Levels 10–44: units.',
 '{1,2,8,9,10,44}', null, 'FAQ p1', array['floor layout','which floor is parking','which floor facilities','level layout'], true, now()),

('11111111-1111-1111-1111-111111111111','unit.type',
 'Only Type A is available: 550 sq ft, 2 bedrooms and 2 bathrooms (1 WC + 1 shower). It is NOT dual-key.',
 '{550,2,2,1,1}', null, 'FAQ p1, brochure p8', array['unit size','how big','how many bedrooms','dual key','saiz unit','berapa bilik','is it dual key','3 bedroom','800 sq ft'], true, now()),

('11111111-1111-1111-1111-111111111111','price.starting',
 'The indicative starting price is RM 265,000 (scheme label "MAMPU MILIK").',
 '{265000}', 'Indicative; subject to final SPA.', 'FAQ p1, brochure p2', array['how much','price','harga','berapa harga','starting price','cheapest unit'], true, now()),

('11111111-1111-1111-1111-111111111111','facilities',
 'Level 9 facilities (30 items) include: swimming pool, waterfall yoga, cabana deck, BBQ deck, pool patio, bubbling pool, wading pool, multi-sport court (shared with Towers B–E), outdoor fitness, playground, SING-K showcase, event patio, pool table, air hockey & table football, surau, multipurpose hall, mini theatre + Sing-K hall, jacuzzi, sauna, changing room, celebrity kitchen, VC pod corner, co-work station, child gated play zone, reading zone, laundry lounge, meditation hall, gym, dance room + indoor yoga, pool shower.',
 '{9,30}', null, 'Brochure p6', array['facilities','what facilities','kemudahan','swimming pool','gym','ada apa'], true, now()),

('11111111-1111-1111-1111-111111111111','facilities.scale',
 'About 42,000 sq ft of facilities, with over 2,200 sq ft of fitness space.',
 '{42000,2200}', null, 'Brochure p5', array['how big facilities','facilities size','gym size'], true, now()),

('11111111-1111-1111-1111-111111111111','security',
 'Security and extras include EV chargers, car-plate recognition, and 24-hour surveillance.',
 '{24}', null, 'Brochure p7', array['security','ev charger','cctv','keselamatan','car plate'], true, now()),

('11111111-1111-1111-1111-111111111111','accessibility',
 'Accessibility: a new access road to Taylor''s Lakeside; direct LDP–PJ toll access; walking distance to BRT SunMed; connected to LDP, KESAS, Federal Highway and NPE.',
 '{}', null, 'Brochure p3, p7', array['how to get there','accessibility','highways','brt','public transport','access road'], true, now()),

('11111111-1111-1111-1111-111111111111','nearby',
 'Nearby: Sunway Pyramid, Sunway Medical Centre, Sunway University, Monash, Taylor''s, Sunway Lagoon and more.',
 '{}', null, 'Brochure p3', array['nearby','what is around','amenities nearby','berhampiran','university nearby','mall nearby'], true, now()),

('11111111-1111-1111-1111-111111111111','unit.specs',
 'Unit specs: RC frame; SPC flooring (bedrooms/living/dining/kitchen/foyer), quality tiles (baths/balcony/yard); aluminium-framed windows; 13 lighting points, 11 power points, 2 A/C points, 1 water-heater point, 1 fibre socket.',
 '{13,11,2,1,1}', null, 'Brochure p8', array['unit specs','flooring','power points','specifications','spesifikasi','what flooring'], true, now()),

('11111111-1111-1111-1111-111111111111','sales.contact',
 'Sales: www.aurumbandarsunway.com · 016-333 1199 (REN 16942) · Kim Realty (exclusive agent). Sales gallery Waze: "AURUM BANDAR SUNWAY SALES GALLERY".',
 '{}', null, 'Brochure p9', array['contact','phone number','sales gallery','how to contact','waze','showroom'], true, now()),

('11111111-1111-1111-1111-111111111111','status',
 'The project is at registration stage — Open for Registration, No Deposit Collected.',
 '{}', null, 'aurumbandarsunway.com', array['status','can i buy now','is it launched','sudah launch','open for sale','registration'], true, now()),

('11111111-1111-1111-1111-111111111111','disclaimer',
 'All information is preliminary and subject to change and authority approval; it is not an offer, and the SPA prevails.',
 '{}', 'All info preliminary; SPA prevails.', 'Both PDFs', array['disclaimer','is this final','subject to change'], true, now())
on conflict (tenant_id, key) do nothing;

-- ---- verbatim_answers: seed empty (inactive) rows for every §1.3 gap topic --
insert into verbatim_answers (tenant_id, topic, trigger_patterns, active) values
('11111111-1111-1111-1111-111111111111','eligibility', array['eligible','income cap','mampu milik criteria','layak','household income'], false),
('11111111-1111-1111-1111-111111111111','registration_process', array['how to register','booking process','how to book','fees','proses daftar'], false),
('11111111-1111-1111-1111-111111111111','booking_fee_refund', array['refund','loan rejected refund','booking fee','deposit refund'], false),
('11111111-1111-1111-1111-111111111111','bumiputera', array['bumi quota','bumiputera discount','diskaun bumi'], false),
('11111111-1111-1111-1111-111111111111','maintenance_fee', array['maintenance fee','sinking fund','psf maintenance','yuran penyelenggaraan'], false),
('11111111-1111-1111-1111-111111111111','car_park', array['car park','parking allocation','how many parking','tempat letak kereta'], false),
('11111111-1111-1111-1111-111111111111','completion_date', array['completion','vacant possession','when ready','when keys','bila siap','vp date'], false),
('11111111-1111-1111-1111-111111111111','financing', array['loan','bank panel','margin','financing','pinjaman'], false),
('11111111-1111-1111-1111-111111111111','rental_restriction', array['rent out','airbnb','rental restriction','boleh sewa'], false),
('11111111-1111-1111-1111-111111111111','pet_policy', array['pets','can i keep pet','boleh bela haiwan'], false),
('11111111-1111-1111-1111-111111111111','launch_date', array['launch date','showroom hours','opening hours','bila launch'], false)
on conflict do nothing;
