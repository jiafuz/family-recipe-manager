ALTER TABLE media_assets
  ADD COLUMN upload_status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER height,
  ADD CONSTRAINT chk_media_upload_status
    CHECK (upload_status IN ('pending', 'ready', 'failed'));
