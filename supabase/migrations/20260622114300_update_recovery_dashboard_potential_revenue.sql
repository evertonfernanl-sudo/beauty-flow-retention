-- Redefine recovery_dashboard view to calculate potential_revenue using only the oldest expected return opportunity per client
CREATE OR REPLACE VIEW public.recovery_dashboard
WITH (security_invoker = true) AS
WITH oldest_opportunities AS (
  SELECT DISTINCT ON (company_id, client_id)
    company_id,
    client_id,
    potential_value
  FROM public.recovery_opportunities
  WHERE status IN ('OPEN', 'IN_CONTACT')
  ORDER BY company_id, client_id, expected_return_date ASC
)
SELECT
  r.company_id,
  COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT'))                                AS pending_count,
  COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT') AND r.classification = 'AT_RISK') AS at_risk_count,
  COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT') AND r.classification = 'LOST')    AS lost_count,
  (
    SELECT COALESCE(SUM(o.potential_value), 0)
    FROM oldest_opportunities o
    WHERE o.company_id = r.company_id
  ) AS potential_revenue,
  COUNT(*) FILTER (WHERE r.status='CONVERTED' AND r.converted_at >= date_trunc('month', now())) AS recovered_count_month,
  COALESCE(SUM(r.recovered_value) FILTER (WHERE r.status='CONVERTED' AND r.converted_at >= date_trunc('month', now())), 0) AS recovered_value_month,
  CASE WHEN COUNT(*) FILTER (WHERE r.status IN ('CONVERTED','LOST')) = 0 THEN 0
       ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE r.status='CONVERTED')
                       / NULLIF(COUNT(*) FILTER (WHERE r.status IN ('CONVERTED','LOST')),0), 1)
  END AS recovery_rate,
  COALESCE(AVG(EXTRACT(EPOCH FROM (r.converted_at - r.created_at))/86400)
           FILTER (WHERE r.status='CONVERTED'), 0) AS avg_days_to_recover,
  COALESCE(AVG(r.recovered_value) FILTER (WHERE r.status='CONVERTED'), 0) AS avg_recovered_ticket
FROM public.recovery_opportunities r
GROUP BY r.company_id;
