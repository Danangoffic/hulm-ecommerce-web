-- Seed: super_admin user
-- Password: kabeldatarole (bcrypt, 12 rounds)
INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Danang Arif Rahmanda',
  'darifrahmanda@gmail.com',
  '$2b$12$y8zH/Cb2gyc1WVfVuD1a3Oa9cqdp9ymMkPu8MzR6UjiSqHbcVKWNO',
  'super_admin',
  true,
  now(),
  now()
)
ON CONFLICT (email) DO NOTHING;
