package com.enerlution.ems.ingestion;

import java.nio.file.*;
import java.util.*;
import java.io.*;
import org.apache.kafka.clients.producer.ProducerConfig;

/** Managed property files may reference Kafka FileConfigProvider; secrets never enter command arguments. */
public record IngestionProperties(String mqttUri,String clientId,Path mqttCa,Path mqttCertificate,Path mqttKey,
 Path kafkaConfig,Map<IngressEnvelope.Lane,String> topics,int capacity,int leaseSeconds,String databaseUrl,String databaseUser,String databasePassword) {
 public static IngestionProperties environment(){
  return new IngestionProperties(env("EMS_MQTT_URI","ssl://127.0.0.1:8883"),env("EMS_MQTT_CLIENT_ID","ems-cloud-v3-ingestion"),
   Path.of(required("EMS_MQTT_CA")),Path.of(required("EMS_MQTT_CERT")),Path.of(required("EMS_MQTT_KEY")),
   Path.of(env("EMS_KAFKA_CONFIG","/etc/ems-cloud-v3/kafka-client.properties")),
   Map.of(IngressEnvelope.Lane.FAST,env("EMS_KAFKA_FAST_TOPIC","ems-cloud-v3.ingress.fast.v1"),
    IngressEnvelope.Lane.STATE,env("EMS_KAFKA_STATE_TOPIC","ems-cloud-v3.ingress.state.v1"),IngressEnvelope.Lane.RELIABLE,env("EMS_KAFKA_RELIABLE_TOPIC","ems-cloud-v3.ingress.reliable.v1")),
   Integer.parseInt(env("EMS_QUEUE_CAPACITY","256")),Integer.parseInt(env("EMS_LEASE_SECONDS","30")),required("EMS_DATABASE_URL"),required("EMS_DATABASE_USER"),required("EMS_DATABASE_PASSWORD"));
 }
 public Properties producerProperties() throws IOException {
  var p=new Properties();try(var in=Files.newInputStream(kafkaConfig)){p.load(in);}
  p.setProperty(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,"org.apache.kafka.common.serialization.StringSerializer");
  p.setProperty(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG,"org.apache.kafka.common.serialization.StringSerializer");
  p.setProperty(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG,"true");p.setProperty(ProducerConfig.ACKS_CONFIG,"all");
  p.setProperty(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION,"1");
  p.setProperty(ProducerConfig.BUFFER_MEMORY_CONFIG,"8388608");p.setProperty(ProducerConfig.MAX_BLOCK_MS_CONFIG,"1000");
  p.setProperty(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG,"10000");p.setProperty(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG,"5000");
  return p;
 }
 private static String required(String key){var v=System.getenv(key);if(v==null||v.isBlank())throw new IllegalArgumentException("Missing environment "+key);return v;}
 private static String env(String key,String fallback){return System.getenv().getOrDefault(key,fallback);}
 @Override public String toString(){return "IngestionProperties[managed configuration]";}
}
