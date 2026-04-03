-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Placeholder legal documents (GDPR, CCPA) - can be updated via dashboard
INSERT INTO public.legal_documents (type, country_code, version, content, effective_date) VALUES
('privacy_policy', 'IT', '1.0', 'Informativa Privacy conforme al Regolamento UE 2016/679 (GDPR). I tuoi dati sono trattati in modo sicuro e trasparente. Diritti: accesso, rettifica, cancellazione, portabilità, opposizione.', NOW()),
('terms_of_service', 'IT', '1.0', 'Termini di Servizio. Utilizzando il servizio accetti le condizioni. Il servizio è fornito "as is".', NOW()),
('security_policy', 'IT', '1.0', 'Normativa Sicurezza. Dati crittografati, backup regolari, conformità GDPR.', NOW()),
('privacy_policy', 'US', '1.0', 'Privacy Policy compliant with California Consumer Privacy Act (CCPA). Your data is handled securely. Rights: know, delete, opt-out.', NOW()),
('terms_of_service', 'US', '1.0', 'Terms of Service. By using the service you accept the conditions.', NOW()),
('security_policy', 'US', '1.0', 'Security Policy. Encrypted data, regular backups, CCPA compliance.', NOW())
;
