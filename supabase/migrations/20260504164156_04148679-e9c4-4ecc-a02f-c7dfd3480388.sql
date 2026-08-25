insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'face-images',
  'face-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Face images are publicly viewable"
on storage.objects
for select
using (bucket_id = 'face-images');

create policy "Authenticated users can upload face images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'face-images');

create policy "Authenticated users can update face images"
on storage.objects
for update
to authenticated
using (bucket_id = 'face-images')
with check (bucket_id = 'face-images');