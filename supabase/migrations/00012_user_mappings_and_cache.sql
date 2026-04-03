-- Migration: User command mappings + corrections memory
-- Punto 14: User Mapping Table - remember user corrections (e.g., "tubo" = "Tubo Rame 12mm")
-- Punto 16: Embedding cache table (server side)

CREATE TABLE IF NOT EXISTS user_command_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  input_text TEXT NOT NULL,           -- What the user originally said/typed
  mapped_text TEXT NOT NULL,          -- What it was corrected to
  listino_item_id UUID REFERENCES listini_vettoriali(id) ON DELETE SET NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, input_text)
);

-- Index for fast lookup
CREATE INDEX idx_user_command_mappings_profile ON user_command_mappings(profile_id);
CREATE INDEX idx_user_command_mappings_input ON user_command_mappings(profile_id, input_text);

-- RLS
ALTER TABLE user_command_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mappings"
  ON user_command_mappings FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Trigger to update usage count and timestamp
CREATE OR REPLACE FUNCTION update_mapping_usage()
RETURNS TRIGGER AS $$
BEGIN
  NEW.usage_count = OLD.usage_count + 1;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_mapping_usage
  BEFORE UPDATE ON user_command_mappings
  FOR EACH ROW EXECUTE FUNCTION update_mapping_usage();

-- Embedding cache table (server-side caching of embeddings)
CREATE TABLE IF NOT EXISTS embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash TEXT NOT NULL UNIQUE,     -- SHA-256 of normalized text
  text_content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  usage_count INTEGER DEFAULT 1
);

CREATE INDEX idx_embedding_cache_hash ON embedding_cache(text_hash);

-- Auto-cleanup old cache entries (>90 days unused)
CREATE OR REPLACE FUNCTION cleanup_embedding_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM embedding_cache
  WHERE last_used_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
