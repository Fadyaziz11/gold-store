
CREATE POLICY proofs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY proofs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
