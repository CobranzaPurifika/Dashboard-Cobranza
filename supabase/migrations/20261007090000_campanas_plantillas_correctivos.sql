-- Módulo Campañas: un mensaje distinto por cada recordatorio correctivo semanal (R1-R4).
--
-- Las claves pasan de "correctivo_<canal>" a "correctivo_r1_<canal>" … "correctivo_r4_<canal>".
-- Una plantilla correctiva ya editada se conserva como la del primer recordatorio. El
-- backend valida las claves; la restricción solo protege el formato.
alter table public.campana_plantillas drop constraint if exists campana_plantillas_clave_check;

update public.campana_plantillas
set clave = regexp_replace(clave, '^correctivo_', 'correctivo_r1_')
where clave in ('correctivo_whatsapp', 'correctivo_correo_asunto', 'correctivo_correo');

alter table public.campana_plantillas add constraint campana_plantillas_clave_check
  check (clave ~ '^(preventivo|correctivo_r[1-4])_(whatsapp|correo_asunto|correo)$');
