-- Release Radar · seed data. Run after schema.sql.
-- 24 public repos from Keerthi's stack (payments, auth, banking APIs, server stack) + 4 tools under evaluation.

insert into repos (owner, name, category, why) values
  ('stripe','stripe-node','dependency','Payment gateway SDK (Node)'),
  ('stripe','stripe-python','dependency','Payment gateway SDK (Python services)'),
  ('razorpay','razorpay-node','dependency','Payment gateway SDK (India)'),
  ('paypal','paypal-js','dependency','Payment gateway SDK (web checkout)'),
  ('Adyen','adyen-node-api-library','dependency','Payment gateway SDK'),
  ('braintree','braintree_node','dependency','Payment gateway SDK'),
  ('square','square-nodejs-sdk','dependency','Payment gateway SDK'),
  ('plaid','plaid-node','dependency','Banking data API'),
  ('auth0','node-auth0','dependency','Auth provider SDK'),
  ('auth0','node-jsonwebtoken','dependency','JWT signing and verification'),
  ('panva','jose','dependency','JOSE / JWT crypto'),
  ('nextauthjs','next-auth','dependency','App authentication'),
  ('jaredhanson','passport','dependency','Auth middleware'),
  ('keycloak','keycloak','dependency','Identity server'),
  ('openssl','openssl','dependency','TLS / crypto (security releases matter)'),
  ('supabase','supabase-js','dependency','Database + auth client'),
  ('prisma','prisma','dependency','ORM'),
  ('expressjs','express','dependency','API server framework'),
  ('nestjs','nest','dependency','Backend framework'),
  ('axios','axios','dependency','HTTP client for all gateway calls'),
  ('honojs','hono','evaluating','Evaluating: edge API framework'),
  ('drizzle-team','drizzle-orm','evaluating','Evaluating: lighter ORM'),
  ('fastify','fastify','evaluating','Evaluating: faster API server'),
  ('ory','hydra','evaluating','Evaluating: self-hosted OAuth2 server')
on conflict do nothing;

-- Team for assignment. Replace emails with real addresses.
-- Note: Resend can only email addresses outside your own account after you verify a sending domain.
insert into team (name, email, role) values
  ('Keerthi', 'keerthi@example.com', 'Senior engineer (owner)'),
  ('Arjun', 'arjun@example.com', 'Payments engineer'),
  ('Meera', 'meera@example.com', 'Auth / security engineer'),
  ('Rahul', 'rahul@example.com', 'Platform engineer')
on conflict (email) do nothing;
