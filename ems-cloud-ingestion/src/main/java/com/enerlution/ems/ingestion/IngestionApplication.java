package com.enerlution.ems.ingestion;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.postgresql.ds.PGSimpleDataSource;
import java.util.UUID;
@SpringBootApplication
public class IngestionApplication {
 public static void main(String[] args) throws Exception {
  var app=new SpringApplication(IngestionApplication.class);app.setWebApplicationType(WebApplicationType.NONE);app.run(args);
  var p=IngestionProperties.environment();var source=new PGSimpleDataSource();source.setURL(p.databaseUrl());source.setUser(p.databaseUser());source.setPassword(p.databasePassword());source.setConnectTimeout(5);source.setSocketTimeout(5);source.setCancelSignalTimeout(2);
  var worker=new IngestionWorker(p,new GatewayLease(source,p.clientId()+":"+UUID.randomUUID(),p.leaseSeconds()),source,p.clickHouseWriter());
  Runtime.getRuntime().addShutdownHook(new Thread(worker::close,"ingestion-shutdown"));
 }
}
