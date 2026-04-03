-- Add default_quote_template column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_quote_template VARCHAR(50) DEFAULT 'classic';

-- Add custom_template_html column for uploaded custom templates
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_template_html TEXT;

-- Add comments
COMMENT ON COLUMN profiles.default_quote_template IS 'Default quote template type: classic, minimal, professional, or custom';
COMMENT ON COLUMN profiles.custom_template_html IS 'Custom HTML template uploaded by user with placeholders like {{lavoroTitle}}, {{clienteName}}, etc.';
