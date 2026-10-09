-- Design configuration is relational; telemetry and discovered hardware remain separate.
CREATE TABLE station_design (
 station_id bigint PRIMARY KEY REFERENCES station(id) ON DELETE CASCADE,
 template varchar(60) NOT NULL,
 operating_mode varchar(40) NOT NULL,
 monitoring_scope varchar(100) NOT NULL
);
CREATE TABLE station_design_node (
 device_id bigint PRIMARY KEY REFERENCES device(id) ON DELETE CASCADE,
 node_type varchar(30) NOT NULL CHECK(node_type IN ('电网','电表','变压器','交流母线','光伏','PCS','电池 / BMS','负载','EMS')),
 x numeric NOT NULL CHECK(x>=0),y numeric NOT NULL CHECK(y>=0),
 rating numeric CHECK(rating>0),rating_unit varchar(10),voltage varchar(60),
 metering_role varchar(40),grid_device_id bigint REFERENCES device(id),
 CHECK((rating IS NULL)=(rating_unit IS NULL)),CHECK(grid_device_id IS NULL OR grid_device_id<>device_id)
);
CREATE TABLE station_design_port (
 device_id bigint NOT NULL REFERENCES station_design_node(device_id) ON DELETE CASCADE,
 code varchar(30) NOT NULL CHECK(btrim(code)<>''),interface varchar(40) NOT NULL CHECK(btrim(interface)<>''),
 protocol varchar(40) NOT NULL CHECK(protocol IN ('Modbus TCP','Modbus RTU','CAN')),
 role varchar(20) NOT NULL CHECK(role IN ('client','server','peer')),
 host inet,tcp_port integer CHECK(tcp_port BETWEEN 1 AND 65535),
 address integer CHECK(address BETWEEN 0 AND 65535),
 baud integer CHECK(baud>0),parity varchar(10),bitrate integer CHECK(bitrate>0),
 PRIMARY KEY(device_id,code)
);
CREATE TABLE station_design_communication (
 from_device_id bigint NOT NULL,from_port varchar(30) NOT NULL,
 to_device_id bigint NOT NULL,to_port varchar(30) NOT NULL,
 PRIMARY KEY(from_device_id,from_port,to_device_id,to_port),
 FOREIGN KEY(from_device_id,from_port) REFERENCES station_design_port(device_id,code) ON DELETE CASCADE,
 FOREIGN KEY(to_device_id,to_port) REFERENCES station_design_port(device_id,code) ON DELETE CASCADE,
 CHECK(from_device_id<>to_device_id)
);
CREATE TABLE station_design_electrical (
 source_device_id bigint NOT NULL,target_device_id bigint NOT NULL,
 source_port varchar(30) NOT NULL,target_port varchar(30) NOT NULL,
 kind varchar(2) NOT NULL CHECK(kind IN ('AC','DC')),
 PRIMARY KEY(source_device_id,target_device_id),
 FOREIGN KEY(source_device_id,target_device_id) REFERENCES topology_connection(source_device_id,target_device_id) ON DELETE CASCADE
);

CREATE FUNCTION check_station_design_relation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a bigint;b bigint;payload jsonb:=to_jsonb(NEW);
BEGIN
 IF TG_TABLE_NAME='station_design_node' THEN
   a:=NEW.device_id;b:=NEW.grid_device_id;
 ELSIF TG_TABLE_NAME='station_design_electrical' THEN
   a:=(payload->>'source_device_id')::bigint;b:=(payload->>'target_device_id')::bigint;
 ELSE
   a:=(payload->>'from_device_id')::bigint;b:=(payload->>'to_device_id')::bigint;
 END IF;
 IF b IS NOT NULL AND (SELECT station_id FROM device WHERE id=a) IS DISTINCT FROM (SELECT station_id FROM device WHERE id=b) THEN
   RAISE EXCEPTION 'Design endpoints must belong to the same station';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER design_node_station AFTER INSERT OR UPDATE ON station_design_node
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_station_design_relation();
CREATE CONSTRAINT TRIGGER design_electrical_station AFTER INSERT OR UPDATE ON station_design_electrical
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_station_design_relation();
CREATE CONSTRAINT TRIGGER design_communication_station AFTER INSERT OR UPDATE ON station_design_communication
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_station_design_relation();
