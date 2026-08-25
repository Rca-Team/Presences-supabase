INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'face-images',
  'face-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id)
DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Face images are publicly viewable'
  ) THEN
    CREATE POLICY "Face images are publicly viewable"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'face-images');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload face images'
  ) THEN
    CREATE POLICY "Authenticated users can upload face images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'face-images');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update face images'
  ) THEN
    CREATE POLICY "Authenticated users can update face images"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'face-images')
    WITH CHECK (bucket_id = 'face-images');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete face images'
  ) THEN
    CREATE POLICY "Authenticated users can delete face images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'face-images');
  END IF;
END
$$;