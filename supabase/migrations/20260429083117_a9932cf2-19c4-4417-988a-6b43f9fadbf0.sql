
INSERT INTO public.subjects (name, short_name) VALUES
  ('English', 'ENG'),
  ('Mathematics', 'MATH'),
  ('Science', 'SCI'),
  ('Hindi', 'HIN'),
  ('Computer Science', 'CS'),
  ('Social Studies', 'SST'),
  ('Physics', 'PHY'),
  ('Chemistry', 'CHEM'),
  ('Biology', 'BIO'),
  ('History', 'HIST'),
  ('Geography', 'GEO'),
  ('Sanskrit', 'SAN'),
  ('Physical Education', 'PE'),
  ('Art', 'ART'),
  ('Music', 'MUS'),
  ('Economics', 'ECO'),
  ('Accountancy', 'ACC'),
  ('Business Studies', 'BST')
ON CONFLICT DO NOTHING;
