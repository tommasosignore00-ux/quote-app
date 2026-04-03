-- Seed countries with legal frameworks
INSERT INTO public.countries (code, name_en, currency, vat_default, legal_framework) VALUES
-- Europa occidentale
('IT', 'Italy', 'EUR', 22.00, 'GDPR'),
('DE', 'Germany', 'EUR', 19.00, 'GDPR'),
('FR', 'France', 'EUR', 20.00, 'GDPR'),
('ES', 'Spain', 'EUR', 21.00, 'GDPR'),
('GB', 'United Kingdom', 'GBP', 20.00, 'UK_GDPR'),
('AT', 'Austria', 'EUR', 20.00, 'GDPR'),
('NL', 'Netherlands', 'EUR', 21.00, 'GDPR'),
('BE', 'Belgium', 'EUR', 21.00, 'GDPR'),
('PT', 'Portugal', 'EUR', 23.00, 'GDPR'),
('CH', 'Switzerland', 'CHF', 7.70, 'FADP'),
('GR', 'Greece', 'EUR', 24.00, 'GDPR'),
-- Europa dell'Est
('PL', 'Poland', 'PLN', 23.00, 'GDPR'),
('CZ', 'Czech Republic', 'CZK', 21.00, 'GDPR'),
('HU', 'Hungary', 'HUF', 27.00, 'GDPR'),
('RO', 'Romania', 'RON', 19.00, 'GDPR'),
('UA', 'Ukraine', 'UAH', 20.00, 'GDPR'),
('HR', 'Croatia', 'EUR', 25.00, 'GDPR'),
('SK', 'Slovakia', 'EUR', 20.00, 'GDPR'),
('BG', 'Bulgaria', 'BGN', 20.00, 'GDPR'),
('SI', 'Slovenia', 'EUR', 22.00, 'GDPR'),
('RS', 'Serbia', 'RSD', 20.00, 'GDPR'),
('LV', 'Latvia', 'EUR', 21.00, 'GDPR'),
('LT', 'Lithuania', 'EUR', 21.00, 'GDPR'),
('EE', 'Estonia', 'EUR', 22.00, 'GDPR'),
('RU', 'Russia', 'RUB', 20.00, 'GDPR'),
-- Americhe, Asia, Oceania
('US', 'United States', 'USD', 0.00, 'CCPA'),
('CA', 'Canada', 'CAD', 0.00, 'PIPEDA'),
('AU', 'Australia', 'AUD', 10.00, 'APA'),
('CN', 'China', 'CNY', 13.00, 'PIPL'),
('JP', 'Japan', 'JPY', 10.00, 'APPI'),
('KR', 'South Korea', 'KRW', 10.00, 'PIPA'),
('IN', 'India', 'INR', 18.00, 'DPDP'),
('BR', 'Brazil', 'BRL', 17.00, 'LGPD')
ON CONFLICT (code) DO NOTHING;
