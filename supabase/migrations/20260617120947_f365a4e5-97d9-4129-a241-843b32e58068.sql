
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS monthly_revenue_goal numeric(12,2) NOT NULL DEFAULT 0;

-- Service rankings view (per company)
CREATE OR REPLACE VIEW public.service_metrics
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.company_id,
  s.name,
  s.category,
  s.color,
  s.price,
  s.return_days,
  COUNT(a.id) FILTER (WHERE a.status = 'COMPLETED')                               AS total_completed,
  COALESCE(SUM(a.price) FILTER (WHERE a.status = 'COMPLETED'), 0)                 AS total_revenue,
  COUNT(DISTINCT a.client_id) FILTER (WHERE a.status = 'COMPLETED')               AS unique_clients,
  CASE WHEN COUNT(DISTINCT a.client_id) FILTER (WHERE a.status = 'COMPLETED') = 0 THEN 0
       ELSE ROUND(
         COUNT(a.id) FILTER (WHERE a.status = 'COMPLETED')::numeric
         / NULLIF(COUNT(DISTINCT a.client_id) FILTER (WHERE a.status = 'COMPLETED'),0)
       , 2)
  END AS recurrence_ratio
FROM public.services s
LEFT JOIN public.appointments a ON a.service_id = s.id
GROUP BY s.id;
GRANT SELECT ON public.service_metrics TO authenticated;

-- Top clients view
CREATE OR REPLACE VIEW public.top_clients
WITH (security_invoker = true) AS
SELECT id, company_id, name, phone, total_spent, appointments_count, last_visit
FROM public.clients
WHERE total_spent > 0;
GRANT SELECT ON public.top_clients TO authenticated;
