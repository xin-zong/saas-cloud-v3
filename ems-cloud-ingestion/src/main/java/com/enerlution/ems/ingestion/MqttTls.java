package com.enerlution.ems.ingestion;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import javax.net.ssl.*;

public final class MqttTls {
 private MqttTls(){}
 public static SSLSocketFactory create(Path ca,Path certificate,Path key) throws Exception {
  var cf=CertificateFactory.getInstance("X.509");var trust=KeyStore.getInstance("PKCS12");trust.load(null,null);
  try(var in=Files.newInputStream(ca)){int i=0;for(var cert:cf.generateCertificates(in))trust.setCertificateEntry("ca"+i++,cert);}
  java.security.cert.Certificate[] chain;
  try(var in=Files.newInputStream(certificate)){chain=cf.generateCertificates(in).toArray(java.security.cert.Certificate[]::new);}
  var pem=Files.readString(key);if(!pem.contains("-----BEGIN PRIVATE KEY-----"))throw new IllegalArgumentException("MQTT key must be PKCS8 PEM");
  var bytes=Base64.getMimeDecoder().decode(pem.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----",""));
  var privateKey=KeyFactory.getInstance(chain[0].getPublicKey().getAlgorithm()).generatePrivate(new PKCS8EncodedKeySpec(bytes));
  var keys=KeyStore.getInstance("PKCS12");keys.load(null,null);keys.setKeyEntry("client",privateKey,new char[0],chain);
  var km=KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());km.init(keys,new char[0]);
  var tm=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());tm.init(trust);
  var ssl=SSLContext.getInstance("TLSv1.2");ssl.init(km.getKeyManagers(),tm.getTrustManagers(),null);return ssl.getSocketFactory();
 }
}
