-- ============================================================
-- ImpactGraph — seed data
-- Run AFTER schema.sql. Safe to run once on an empty database.
-- Demo login for every developer: password  Demo@1234
-- (stored as a bcrypt hash via pgcrypto — never plaintext)
-- ============================================================

BEGIN;

-- ---------- developers (2 admins, 6 developers) ----------
INSERT INTO developers (developer_id, name, email, github_username, role, joined_date, password_hash, auth_role) VALUES
(1, 'Aarav Sharma', 'aarav@impactgraph.dev',  'aarav-s',   'Engineering Manager', '2023-02-01', crypt('Demo@1234', gen_salt('bf')), 'admin'),
(2, 'Diya Nair',    'diya@impactgraph.dev',   'diya-n',    'Backend Engineer',    '2023-06-12', crypt('Demo@1234', gen_salt('bf')), 'developer'),
(3, 'Rohan Mehta',  'rohan@impactgraph.dev',  'rohan-m',   'SRE',                 '2023-09-04', crypt('Demo@1234', gen_salt('bf')), 'developer'),
(4, 'Sneha Iyer',   'sneha@impactgraph.dev',  'sneha-i',   'Frontend Engineer',   '2024-01-15', crypt('Demo@1234', gen_salt('bf')), 'developer'),
(5, 'Karthik Rao',  'karthik@impactgraph.dev','karthik-r', 'Backend Engineer',    '2023-03-20', crypt('Demo@1234', gen_salt('bf')), 'developer'),
(6, 'Ananya Das',   'ananya@impactgraph.dev', 'ananya-d',  'Data Engineer',       '2024-04-08', crypt('Demo@1234', gen_salt('bf')), 'developer'),
(7, 'Vikram Singh', 'vikram@impactgraph.dev', 'vikram-s',  'Principal SRE',       '2022-11-10', crypt('Demo@1234', gen_salt('bf')), 'admin'),
(8, 'Meera Pillai', 'meera@impactgraph.dev',  'meera-p',   'QA Engineer',         '2024-07-22', crypt('Demo@1234', gen_salt('bf')), 'developer');

-- ---------- repositories ----------
INSERT INTO repositories (repo_id, name, url, description, created_date, owner_id) VALUES
(1, 'payments-platform',   'https://github.com/acme/payments-platform',   'Payment processing and billing services', '2023-03-01', 2),
(2, 'user-identity',       'https://github.com/acme/user-identity',       'Authentication and user profile services', '2023-03-15', 5),
(3, 'order-management',    'https://github.com/acme/order-management',    'Order placement and inventory services',   '2023-05-10', 2),
(4, 'notification-hub',    'https://github.com/acme/notification-hub',    'Notification and email delivery',          '2023-08-02', 6),
(5, 'analytics-pipeline',  'https://github.com/acme/analytics-pipeline',  'Event ingestion and reporting',            '2024-01-20', 6);

-- ---------- services ----------
INSERT INTO services (service_id, name, description, status, created_date, repo_id, maintainer_id) VALUES
(1,  'payment-service',      'Charges and refunds via external gateway',   'active',      '2023-03-05', 1, 2),
(2,  'billing-service',      'Invoice generation and billing cycles',      'active',      '2023-04-18', 1, 2),
(3,  'auth-service',         'Login, JWT issuance and token refresh',      'active',      '2023-03-20', 2, 5),
(4,  'user-profile-service', 'User profile storage and lookup',            'active',      '2023-04-02', 2, 5),
(5,  'order-service',        'Order placement and lifecycle',              'active',      '2023-05-15', 3, 2),
(6,  'inventory-service',    'Stock levels and reservations',              'active',      '2023-05-30', 3, 5),
(7,  'notification-service', 'Notification fan-out and queueing',          'active',      '2023-08-10', 4, 6),
(8,  'email-gateway',        'SMTP/email provider adapter',                'maintenance', '2023-08-25', 4, 6),
(9,  'analytics-ingest',     'Event ingestion into raw store',             'active',      '2024-02-01', 5, 6),
(10, 'reporting-service',    'Daily and ad-hoc business reports',          'deprecated',  '2024-03-12', 5, 6);

-- ---------- commits ----------
INSERT INTO commits (commit_id, message, "timestamp", hash, repo_id, author_id) VALUES
(1,  'Initial payment service scaffold',            '2026-01-08 10:15', md5('commit-1'),  1, 2),
(2,  'Add charge endpoint',                         '2026-01-15 14:30', md5('commit-2'),  1, 2),
(3,  'Integrate auth token validation',             '2026-02-02 11:05', md5('commit-3'),  1, 5),
(4,  'Add refund flow',                             '2026-02-19 16:40', md5('commit-4'),  1, 2),
(5,  'Add retry with backoff on gateway timeout',   '2026-03-11 09:20', md5('commit-5'),  1, 3),
(6,  'Bootstrap auth service',                      '2026-01-05 09:00', md5('commit-6'),  2, 5),
(7,  'Add JWT issuance',                            '2026-01-20 13:10', md5('commit-7'),  2, 5),
(8,  'Add login rate limiting',                     '2026-02-14 15:45', md5('commit-8'),  2, 5),
(9,  'Fix token expiry off-by-one',                 '2026-03-03 10:25', md5('commit-9'),  2, 5),
(10, 'Rotate signing keys',                         '2026-04-09 17:00', md5('commit-10'), 2, 7),
(11, 'Create order model',                          '2026-01-12 10:00', md5('commit-11'), 3, 2),
(12, 'Add order placement API',                     '2026-02-03 12:35', md5('commit-12'), 3, 2),
(13, 'Reserve stock on order',                      '2026-02-27 14:50', md5('commit-13'), 3, 5),
(14, 'Add order integration tests',                 '2026-03-18 11:15', md5('commit-14'), 3, 8),
(15, 'Fix duplicate order on retry',                '2026-04-22 16:05', md5('commit-15'), 3, 2),
(16, 'Notification queue schema',                   '2026-01-25 10:30', md5('commit-16'), 4, 6),
(17, 'Add email gateway adapter',                   '2026-02-10 13:20', md5('commit-17'), 4, 6),
(18, 'Add dead-letter handling',                    '2026-03-07 15:10', md5('commit-18'), 4, 3),
(19, 'Throttle bulk notifications',                 '2026-05-06 09:45', md5('commit-19'), 4, 6),
(20, 'Event ingestion pipeline',                    '2026-02-05 11:00', md5('commit-20'), 5, 6),
(21, 'Add daily aggregation job',                   '2026-03-01 14:15', md5('commit-21'), 5, 6),
(22, 'Deprecate v1 report endpoint',                '2026-05-20 10:40', md5('commit-22'), 5, 6),
(23, 'Add report access controls',                  '2026-06-02 16:25', md5('commit-23'), 5, 1),
(24, 'Partition raw_events by day',                 '2026-06-30 12:00', md5('commit-24'), 5, 6);

-- ---------- apis ----------
INSERT INTO apis (api_id, name, path, version, status, service_id) VALUES
(1,  'Create charge',        '/payments/charge',        'v1', 'active',     1),
(2,  'Create refund',        '/payments/refund',        'v1', 'active',     1),
(3,  'List invoices',        '/invoices',               'v2', 'active',     2),
(4,  'Login',                '/auth/login',             'v1', 'active',     3),
(5,  'Refresh token',        '/auth/token/refresh',     'v1', 'active',     3),
(6,  'Get user',             '/users/{id}',             'v1', 'active',     4),
(7,  'Update user',          '/users/{id}/profile',     'v1', 'beta',       4),
(8,  'Place order',          '/orders',                 'v2', 'active',     5),
(9,  'Get order',            '/orders/{id}',            'v2', 'active',     5),
(10, 'Get stock',            '/stock/{sku}',            'v1', 'active',     6),
(11, 'Send notification',    '/notify',                 'v1', 'active',     7),
(12, 'Send email',           '/email/send',             'v1', 'deprecated', 8),
(13, 'Ingest events',        '/events',                 'v1', 'active',     9),
(14, 'Daily report (old)',   '/reports/daily',          'v1', 'deprecated', 10),
(15, 'Daily report (new)',   '/reports/daily',          'v2', 'beta',       10);

-- ---------- database_tables ----------
INSERT INTO database_tables (table_id, name, description, service_id) VALUES
(1,  'transactions',        'Payment transactions',               1),
(2,  'refunds',             'Refund records',                     1),
(3,  'invoices',            'Generated invoices',                 2),
(4,  'users',               'User profile data',                  4),
(5,  'credentials',         'Hashed credentials',                 3),
(6,  'sessions',            'Active login sessions',              3),
(7,  'orders',              'Order headers',                      5),
(8,  'order_items',         'Order line items',                   5),
(9,  'stock_levels',        'Current stock by SKU',               6),
(10, 'notification_queue',  'Pending notifications',              7),
(11, 'email_log',           'Sent email log',                     8),
(12, 'raw_events',          'Raw analytics events',               9),
(13, 'daily_aggregates',    'Pre-aggregated daily metrics',       10);

-- ---------- issues ----------
INSERT INTO issues (issue_id, title, description, severity, status, created_date, updated_date, service_id, reporter_id) VALUES
(1,  'Charge endpoint returns 500 on null currency',    'Missing validation when currency omitted.',          'high',     'resolved',    '2026-02-05 10:00', '2026-02-07 15:00', 1, 8),
(2,  'Refund amount can exceed original charge',        'No upper-bound check on refund amount.',             'critical', 'closed',      '2026-02-25 11:30', '2026-03-01 09:00', 1, 3),
(3,  'Slow query on transactions by date range',        'Missing index causes full scan.',                    'medium',   'in_progress', '2026-05-12 14:00', '2026-05-20 10:00', 1, 3),
(4,  'Invoice PDF missing tax line',                    'Tax not rendered for zero-rated items.',             'medium',   'open',        '2026-06-03 09:15', NULL,               2, 8),
(5,  'Login lockout not resetting',                     'Counter persists after successful login.',           'high',     'resolved',    '2026-02-20 13:00', '2026-02-22 12:00', 3, 8),
(6,  'Refresh token reuse not detected',                'Old refresh tokens still accepted.',                 'critical', 'in_progress', '2026-06-18 10:45', '2026-06-25 16:00', 3, 7),
(7,  'Profile update drops unicode names',              'Non-ASCII characters stripped on update.',           'medium',   'open',        '2026-07-02 11:00', NULL,               4, 4),
(8,  'User lookup slow under load',                     'p99 latency above 800ms at peak.',                   'high',     'open',        '2026-07-15 15:20', NULL,               4, 3),
(9,  'Duplicate orders on client retry',                'Missing idempotency handling.',                      'critical', 'resolved',    '2026-04-20 12:00', '2026-04-22 17:00', 5, 8),
(10, 'Order total rounding mismatch',                   'Rounding differs from invoice total.',               'low',      'closed',      '2026-03-25 10:10', '2026-04-02 14:30', 5, 8),
(11, 'Order status stuck in PENDING',                   'Status not updated after payment callback.',         'high',     'in_progress', '2026-08-04 09:30', '2026-08-06 11:00', 5, 2),
(12, 'Stock goes negative on concurrent orders',        'Race condition in reservation.',                     'critical', 'in_progress', '2026-05-28 16:00', '2026-06-04 10:30', 6, 8),
(13, 'Stock sync lag after warehouse update',           'Updates take minutes to reflect.',                   'medium',   'open',        '2026-08-19 13:45', NULL,               6, 5),
(14, 'Notifications sent twice',                        'Dead-letter retry resends delivered messages.',      'high',     'resolved',    '2026-03-15 11:20', '2026-03-18 16:00', 7, 8),
(15, 'Bulk send overwhelms downstream',                 'No backpressure on large campaigns.',                'medium',   'open',        '2026-05-14 10:00', NULL,               7, 3),
(16, 'Email provider timeout not retried',              'Single failure drops the message.',                  'high',     'open',        '2026-07-08 14:10', NULL,               8, 6),
(17, 'Raw events table growing unbounded',              'Storage up 40% in a month.',                         'high',     'resolved',    '2026-06-10 09:00', '2026-07-01 12:00', 9, 7),
(18, 'Late events dropped by ingest',                   'Events older than 5 min discarded.',                 'medium',   'open',        '2026-08-25 10:30', NULL,               9, 6),
(19, 'Daily report missing last hour',                  'Cutoff time off by one hour.',                       'low',      'closed',      '2026-04-05 15:00', '2026-04-08 10:00', 10, 1),
(20, 'v2 report endpoint returns empty set',            'Join on aggregates table fails for new tenants.',    'medium',   'open',        '2026-09-02 11:15', NULL,               10, 8);

-- ---------- incidents (embedding added later via pgvector_setup.sql) ----------
INSERT INTO incidents (incident_id, title, description, severity, status, root_cause, resolution, created_date, resolved_date, service_id) VALUES
(1,  'Payment gateway timeouts causing failed charges',   'Charge success rate dropped to 71% for 40 minutes.',      'critical', 'resolved',      'Gateway connection pool exhausted after traffic spike.',     'Increased pool size and added retry with backoff.',          '2026-03-12 08:05', '2026-03-12 09:10', 1),
(2,  'Duplicate charges for retried requests',            'About 120 customers charged twice.',                      'critical', 'resolved',      'Retries lacked idempotency keys.',                            'Introduced idempotency keys; refunded affected customers.',  '2026-04-21 19:30', '2026-04-22 02:15', 1),
(3,  'Auth service outage after key rotation',            'All logins failed for 25 minutes.',                       'critical', 'resolved',      'New signing key not propagated to all replicas.',             'Rolled back key, staged rotation with overlap window.',      '2026-04-09 17:20', '2026-04-09 17:55', 3),
(4,  'Elevated login latency',                            'p95 login latency above 3s.',                             'medium',   'resolved',      'Password hash cost misconfigured after deploy.',              'Reverted cost factor and added config validation.',          '2026-05-16 11:00', '2026-05-16 13:30', 3),
(5,  'Orders stuck pending after payment',                'Roughly 300 orders did not progress.',                    'high',     'resolved',      'Payment callback queue consumer crashed on malformed event.', 'Fixed parser, replayed queued callbacks.',                    '2026-08-04 07:40', '2026-08-04 12:20', 5),
(6,  'Negative stock levels in inventory',                'Several SKUs showed negative availability.',              'high',     'investigating', 'Suspected race in concurrent reservations.',                  NULL,                                                         '2026-06-02 15:10', NULL,                 6),
(7,  'Notification flood to customers',                   'Campaign sent 3x intended volume.',                       'high',     'resolved',      'Dead-letter retry resent already delivered messages.',        'Added delivery receipts check before retry.',                '2026-03-15 10:00', '2026-03-15 14:45', 7),
(8,  'Email delivery halted',                             'No emails delivered for 2 hours.',                        'high',     'resolved',      'Provider API key expired.',                                   'Rotated key and added expiry alerting.',                     '2026-07-08 13:00', '2026-07-08 15:05', 8),
(9,  'Event ingestion backlog',                           'Ingest lag reached 6 hours.',                             'medium',   'resolved',      'raw_events table bloat slowed inserts.',                      'Partitioned table by day and vacuumed.',                     '2026-06-24 09:30', '2026-06-25 18:00', 9),
(10, 'Reports showing stale data',                        'Dashboard figures a day behind.',                         'low',      'open',          NULL,                                                          NULL,                                                         '2026-09-03 08:45', NULL,                 10);

-- ---------- adrs ----------
INSERT INTO adrs (adr_id, title, decision, context, created_date, service_id, author_id) VALUES
(1, 'Use idempotency keys for charge requests',        'All charge and refund calls must carry a client-supplied idempotency key.',    'Duplicate charges occurred when clients retried.',          '2026-04-23 10:00', 1, 2),
(2, 'Adopt short-lived JWT access tokens',             'Access tokens expire in 15 minutes; refresh tokens rotate on use.',            'Long-lived tokens increased breach impact.',                '2026-01-22 11:30', 3, 5),
(3, 'Event-driven stock reservation',                  'Reserve stock via events with optimistic locking rather than direct updates.', 'Concurrent orders caused negative stock.',                   '2026-06-05 14:00', 6, 5),
(4, 'Queue-based notification delivery',               'All notifications go through a durable queue with dead-letter support.',       'Direct sends lost messages on provider failure.',           '2026-03-08 09:45', 7, 6),
(5, 'Partition raw events by day',                     'Partition raw_events by day and drop partitions after 90 days.',               'Table growth degraded insert performance.',                 '2026-06-26 12:15', 9, 6),
(6, 'Deprecate email-gateway for provider SDK',        'New work uses the provider SDK directly; gateway enters maintenance.',          'Gateway adds latency and a single point of failure.',       '2026-07-10 10:30', 8, 1),
(7, 'Circuit breaker on payment gateway calls',        'Wrap gateway calls in a circuit breaker with fallback error responses.',       'Gateway timeouts cascaded into order failures.',            '2026-03-14 16:00', 1, 3),
(8, 'Cache user profiles with 5 minute TTL',           'Cache profile lookups in Redis with a 5 minute TTL.',                          'Profile reads dominate load on the users table.',           '2026-07-20 11:00', 4, 5);

-- ---------- service_dependencies (service depends on depends_on_service) ----------
INSERT INTO service_dependencies (dependency_id, service_id, depends_on_service_id, relationship_type, created_date) VALUES
(1,  5,  1,  'runtime',    '2023-05-20'),
(2,  5,  6,  'runtime',    '2023-06-01'),
(3,  5,  3,  'runtime',    '2023-06-01'),
(4,  1,  3,  'runtime',    '2023-03-25'),
(5,  2,  1,  'runtime',    '2023-04-20'),
(6,  7,  4,  'runtime',    '2023-08-12'),
(7,  7,  8,  'runtime',    '2023-08-28'),
(8,  5,  7,  'runtime',    '2023-09-05'),
(9,  1,  7,  'runtime',    '2023-09-10'),
(10, 4,  3,  'runtime',    '2023-04-05'),
(11, 10, 9,  'data',       '2024-03-15'),
(12, 10, 2,  'data',       '2024-03-20'),
(13, 6,  3,  'build_time', '2023-06-05');

-- ---------- service_api_usage ----------
INSERT INTO service_api_usage (usage_id, service_id, api_id, relationship_type, created_date) VALUES
(1,  5,  1,  'sync',  '2023-05-20'),
(2,  5,  10, 'sync',  '2023-06-01'),
(3,  5,  4,  'sync',  '2023-06-01'),
(4,  5,  11, 'async', '2023-09-05'),
(5,  1,  5,  'sync',  '2023-03-25'),
(6,  1,  11, 'async', '2023-09-10'),
(7,  2,  1,  'sync',  '2023-04-20'),
(8,  7,  6,  'sync',  '2023-08-12'),
(9,  7,  12, 'async', '2023-08-28'),
(10, 4,  4,  'sync',  '2023-04-05'),
(11, 6,  5,  'sync',  '2023-06-05'),
(12, 10, 13, 'async', '2024-03-15'),
(13, 10, 2,  'sync',  '2024-03-20');

-- ---------- service_table_usage ----------
INSERT INTO service_table_usage (usage_id, service_id, table_id, relationship_type, created_date) VALUES
(1,  1,  1,  'read_write', '2023-03-05'),
(2,  1,  2,  'read_write', '2023-03-05'),
(3,  2,  3,  'read_write', '2023-04-18'),
(4,  2,  1,  'read_only',  '2023-04-20'),
(5,  3,  5,  'read_write', '2023-03-20'),
(6,  3,  6,  'read_write', '2023-03-20'),
(7,  4,  4,  'read_write', '2023-04-02'),
(8,  4,  5,  'read_only',  '2023-04-05'),
(9,  5,  7,  'read_write', '2023-05-15'),
(10, 5,  8,  'read_write', '2023-05-15'),
(11, 5,  9,  'read_only',  '2023-06-01'),
(12, 6,  9,  'read_write', '2023-05-30'),
(13, 7,  10, 'read_write', '2023-08-10'),
(14, 7,  4,  'read_only',  '2023-08-12'),
(15, 8,  11, 'read_write', '2023-08-25'),
(16, 9,  12, 'write_only', '2024-02-01'),
(17, 10, 13, 'read_write', '2024-03-12'),
(18, 10, 12, 'read_only',  '2024-03-15'),
(19, 10, 3,  'read_only',  '2024-03-20');

-- ---------- audit_logs ----------
INSERT INTO audit_logs (log_id, action, entity_type, entity_id, old_value, new_value, "timestamp", performed_by) VALUES
(1,  'CREATE', 'service',  1,  NULL,                                   '{"name":"payment-service","status":"active"}',        '2023-03-05 10:00', 2),
(2,  'CREATE', 'service',  10, NULL,                                   '{"name":"reporting-service","status":"active"}',      '2024-03-12 11:00', 6),
(3,  'UPDATE', 'service',  8,  '{"status":"active"}',                  '{"status":"maintenance"}',                            '2026-07-10 10:45', 1),
(4,  'UPDATE', 'service',  10, '{"status":"active"}',                  '{"status":"deprecated"}',                             '2026-05-21 09:30', 6),
(5,  'UPDATE', 'issue',    1,  '{"status":"open"}',                    '{"status":"resolved"}',                               '2026-02-07 15:00', 2),
(6,  'UPDATE', 'issue',    2,  '{"status":"in_progress"}',             '{"status":"closed"}',                                 '2026-03-01 09:00', 3),
(7,  'UPDATE', 'issue',    9,  '{"status":"open"}',                    '{"status":"resolved"}',                               '2026-04-22 17:00', 2),
(8,  'CREATE', 'incident', 1,  NULL,                                   '{"severity":"critical","status":"open"}',             '2026-03-12 08:05', 3),
(9,  'UPDATE', 'incident', 1,  '{"status":"open"}',                    '{"status":"resolved"}',                               '2026-03-12 09:10', 3),
(10, 'CREATE', 'incident', 3,  NULL,                                   '{"severity":"critical","status":"open"}',             '2026-04-09 17:20', 7),
(11, 'UPDATE', 'incident', 5,  '{"status":"investigating"}',           '{"status":"resolved"}',                               '2026-08-04 12:20', 2),
(12, 'CREATE', 'adr',      1,  NULL,                                   '{"title":"Use idempotency keys for charge requests"}','2026-04-23 10:00', 2),
(13, 'CREATE', 'adr',      6,  NULL,                                   '{"title":"Deprecate email-gateway for provider SDK"}','2026-07-10 10:30', 1),
(14, 'DELETE', 'api',      99, '{"path":"/legacy/ping","version":"v0"}', NULL,                                                '2026-05-25 14:00', 5),
(15, 'UPDATE', 'developer',3,  '{"auth_role":"developer"}',            '{"auth_role":"developer","role":"SRE"}',              '2026-06-01 10:10', 1);

-- ---------- keep SERIAL sequences in step with explicit ids ----------
SELECT setval(pg_get_serial_sequence('developers','developer_id'),       (SELECT max(developer_id) FROM developers));
SELECT setval(pg_get_serial_sequence('repositories','repo_id'),          (SELECT max(repo_id) FROM repositories));
SELECT setval(pg_get_serial_sequence('commits','commit_id'),             (SELECT max(commit_id) FROM commits));
SELECT setval(pg_get_serial_sequence('services','service_id'),           (SELECT max(service_id) FROM services));
SELECT setval(pg_get_serial_sequence('apis','api_id'),                   (SELECT max(api_id) FROM apis));
SELECT setval(pg_get_serial_sequence('database_tables','table_id'),      (SELECT max(table_id) FROM database_tables));
SELECT setval(pg_get_serial_sequence('issues','issue_id'),               (SELECT max(issue_id) FROM issues));
SELECT setval(pg_get_serial_sequence('incidents','incident_id'),         (SELECT max(incident_id) FROM incidents));
SELECT setval(pg_get_serial_sequence('adrs','adr_id'),                   (SELECT max(adr_id) FROM adrs));
SELECT setval(pg_get_serial_sequence('audit_logs','log_id'),             (SELECT max(log_id) FROM audit_logs));
SELECT setval(pg_get_serial_sequence('service_dependencies','dependency_id'), (SELECT max(dependency_id) FROM service_dependencies));
SELECT setval(pg_get_serial_sequence('service_api_usage','usage_id'),    (SELECT max(usage_id) FROM service_api_usage));
SELECT setval(pg_get_serial_sequence('service_table_usage','usage_id'),  (SELECT max(usage_id) FROM service_table_usage));

COMMIT;
