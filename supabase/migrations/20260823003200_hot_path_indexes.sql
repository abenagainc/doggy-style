-- Scaling foundations: hot-path composite indexes.
-- These keep RLS subqueries, feed scans, and list RPCs fast as tables grow.

-- interests: direction lookups + cooldown filtering (feed + likes lists)
create index if not exists interests_target_status_idx on public.interests(target_dog_id, status) where status = 'ACTIVE';
create index if not exists interests_source_status_idx on public.interests(source_dog_id, status) where status = 'ACTIVE';

-- candidate_passes: pass checks during feed build
create index if not exists passes_source_idx on public.candidate_passes(source_dog_id, target_dog_id);
create index if not exists passes_target_idx on public.candidate_passes(target_dog_id);

-- connections: RLS participant subqueries evaluate these constantly
create index if not exists connections_owner_a_idx on public.connections(owner_a_id);
create index if not exists connections_owner_b_idx on public.connections(owner_b_id);
create index if not exists connections_lower_idx on public.connections(lower_dog_id);
create index if not exists connections_higher_idx on public.connections(higher_dog_id);
create index if not exists conversations_connection_idx on public.conversations(connection_id);

-- messages: thread loading (last-first) + last-message previews in list RPCs
create index if not exists messages_conv_sent_idx on public.messages(conversation_id, sent_at desc);

-- notifications: unread badge count + bell list
create index if not exists notifications_owner_unread_idx on public.notifications(owner_id, created_at desc) where read_at is null;
create index if not exists notifications_owner_created_idx on public.notifications(owner_id, created_at desc);

-- dog_photos: cover lookup used by dog_cover_photo() on every list render
create index if not exists dog_photos_cover_lookup_idx on public.dog_photos(dog_id) where is_cover;

-- screening_answers: proceeding gate check
create index if not exists screening_answers_conn_idx on public.screening_answers(connection_id);
