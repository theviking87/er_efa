UPDATE public.sessoes
SET horas = GREATEST(0,
  EXTRACT(EPOCH FROM (hora_fim - hora_inicio))/3600.0
  - GREATEST(0, EXTRACT(EPOCH FROM (LEAST(hora_fim, TIME '14:00') - GREATEST(hora_inicio, TIME '13:00')))/3600.0)
)
WHERE hora_fim > hora_inicio;