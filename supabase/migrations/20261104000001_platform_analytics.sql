-- Platform-wide aggregates are calculated in Postgres so the admin page does
-- not silently truncate as organisations and ledger rows grow.
create or replace function public.platform_org_metrics()
returns table (
  org_id uuid,
  user_count bigint,
  location_count bigint,
  recipe_count bigint,
  stocked_products bigint,
  stock_value_paise bigint,
  stock_events_7d bigint,
  sales_7d_paise bigint,
  sales_30d_paise bigint,
  portions_30d bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.is_platform_admin(), 'Platform admins only');

  return query
  with members as (
    select m.org_id, count(*) as n from public.org_members m group by m.org_id
  ), places as (
    select l.org_id, count(*) as n from public.locations l
    where not l.archived group by l.org_id
  ), recipes as (
    select r.org_id, count(*) as n from public.recipes r
    where not r.archived group by r.org_id
  ), balances as (
    select sm.org_id, sm.product_id, sum(sm.qty_base) as qty_base
    from public.stock_movements sm group by sm.org_id, sm.product_id
  ), inventory as (
    select b.org_id,
      count(*) filter (where b.qty_base > 0) as products,
      coalesce(sum(round(b.qty_base::numeric * p.cost_paise / p.pack_qty)), 0)::bigint as value_paise
    from balances b join public.products p on p.id = b.product_id
    group by b.org_id
  ), activity as (
    select sm.org_id, count(*) as n from public.stock_movements sm
    where sm.occurred_at >= now() - interval '7 days' group by sm.org_id
  ), sales as (
    select s.org_id,
      coalesce(sum(s.qty::bigint * r.sell_price_paise)
        filter (where s.sale_date >= current_date - 6), 0)::bigint as revenue_7d,
      coalesce(sum(s.qty::bigint * r.sell_price_paise), 0)::bigint as revenue_30d,
      coalesce(sum(s.qty), 0)::bigint as portions
    from public.sales s join public.recipes r on r.id = s.recipe_id
    where s.sale_date >= current_date - 29
    group by s.org_id
  )
  select o.id, coalesce(m.n, 0), coalesce(l.n, 0), coalesce(r.n, 0),
    coalesce(i.products, 0), coalesce(i.value_paise, 0), coalesce(a.n, 0),
    coalesce(s.revenue_7d, 0), coalesce(s.revenue_30d, 0), coalesce(s.portions, 0)
  from public.organisations o
  left join members m on m.org_id = o.id
  left join places l on l.org_id = o.id
  left join recipes r on r.org_id = o.id
  left join inventory i on i.org_id = o.id
  left join activity a on a.org_id = o.id
  left join sales s on s.org_id = o.id;
end;
$$;

create or replace function public.platform_daily_sales(p_org uuid default null)
returns table (sale_day date, revenue_paise bigint, portions bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.is_platform_admin(), 'Platform admins only');

  return query
  select d.day::date,
    coalesce(sum(s.qty::bigint * r.sell_price_paise), 0)::bigint,
    coalesce(sum(s.qty), 0)::bigint
  from generate_series(current_date - 13, current_date, interval '1 day') as d(day)
  left join public.sales s on s.sale_date = d.day::date
    and (p_org is null or s.org_id = p_org)
  left join public.recipes r on r.id = s.recipe_id
  group by d.day order by d.day;
end;
$$;

revoke all on function public.platform_org_metrics(), public.platform_daily_sales(uuid) from public;
grant execute on function public.platform_org_metrics(), public.platform_daily_sales(uuid) to authenticated;
