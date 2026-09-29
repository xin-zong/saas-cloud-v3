-- Run after V17 as the database owner in the dedicated prototype business database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'ems_cloud_v2_proto' THEN
    RAISE EXCEPTION 'Wrong business database';
  END IF;
END $$;
GRANT SELECT ON public.telemetry_diagnostic_evidence TO ems_proto_app;
GRANT SELECT, INSERT, UPDATE ON public.analysis_job TO ems_proto_app;
GRANT SELECT, INSERT ON public.analysis_job_point, public.analysis_job_artifact TO ems_proto_app;
COMMIT;
