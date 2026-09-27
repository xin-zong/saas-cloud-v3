-- Ownership is inferred only from an unambiguous existing station organization.
ALTER TABLE customer ADD COLUMN organization_id bigint REFERENCES organization(id) ON DELETE RESTRICT,
 ADD COLUMN entity varchar(160), ADD COLUMN contact varchar(254);
UPDATE customer c SET organization_id=x.organization_id FROM (
 SELECT customer_id,min(organization_id) AS organization_id FROM station
 WHERE customer_id IS NOT NULL GROUP BY customer_id
 HAVING count(DISTINCT organization_id)=1 AND count(organization_id)=count(*)
) x WHERE x.customer_id=c.id;
-- Unlinked, mixed-organization or ownerless legacy rows require explicit reconciliation.
ALTER TABLE customer ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customer ADD CONSTRAINT customer_name_trimmed CHECK(name !~ '^[[:space:]]|[[:space:]]$' AND name<>''),
 ADD CONSTRAINT customer_entity_trimmed CHECK(entity IS NULL OR (entity !~ '^[[:space:]]|[[:space:]]$' AND entity<>'')),
 ADD CONSTRAINT customer_contact_trimmed CHECK(contact IS NULL OR (contact !~ '^[[:space:]]|[[:space:]]$' AND contact<>''));
CREATE INDEX customer_organization ON customer(organization_id);
CREATE INDEX station_customer ON station(customer_id);

-- Keep the ownership invariant when stations or organization subtrees move later.
CREATE FUNCTION check_customer_station_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(78291001);
 IF EXISTS (
  WITH RECURSIVE branches(owner_id,id) AS (
   SELECT id,id FROM organization UNION
   SELECT b.owner_id,o.id FROM branches b JOIN organization o ON o.parent_id=b.id
  ) SELECT 1 FROM station st JOIN customer c ON c.id=st.customer_id
    WHERE NOT EXISTS(SELECT 1 FROM branches b WHERE b.owner_id=c.organization_id AND b.id=st.organization_id)
 ) THEN RAISE EXCEPTION 'customer owner must contain station organization' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER station_customer_ownership AFTER INSERT OR UPDATE OF customer_id,organization_id ON station
 FOR EACH STATEMENT EXECUTE FUNCTION check_customer_station_ownership();
CREATE TRIGGER customer_station_ownership AFTER UPDATE OF organization_id ON customer
 FOR EACH STATEMENT EXECUTE FUNCTION check_customer_station_ownership();
CREATE TRIGGER organization_customer_ownership AFTER UPDATE OF parent_id ON organization
 FOR EACH STATEMENT EXECUTE FUNCTION check_customer_station_ownership();
