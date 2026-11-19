-- Messenger media: broaden marketplace-media MIME allowlist for voice/file notes.
-- Chat select policy marketplace_media_select_chat already allows {uid}/chat/* reads.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm',
  'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/wave',
  'application/pdf','text/plain',
  'application/octet-stream'
]
WHERE id = 'marketplace-media';
