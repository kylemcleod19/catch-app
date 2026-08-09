CREATE POLICY "Users can view their own tackle photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tackle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload their own tackle photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tackle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own tackle photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tackle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own tackle photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tackle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);