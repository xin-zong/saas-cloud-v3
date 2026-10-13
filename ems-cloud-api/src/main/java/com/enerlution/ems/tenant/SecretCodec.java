package com.enerlution.ems.tenant;

import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** AES-GCM payloads, separated from TOTP ciphertext by authenticated purpose. */
@Component
public class SecretCodec {
  private final String key;

  public SecretCodec(@Value("${ems.auth.mfa-encryption-key:}") String key) {
    this.key = key;
  }

  public String encrypt(String plain) {
    try {
      byte[] nonce = new byte[12];
      new SecureRandom().nextBytes(nonce);
      Cipher cipher = cipher(Cipher.ENCRYPT_MODE, nonce);
      byte[] bytes = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
      return "tenant-v1:"
          + Base64.getEncoder()
              .encodeToString(
                  ByteBuffer.allocate(nonce.length + bytes.length).put(nonce).put(bytes).array());
    } catch (Exception e) {
      throw new IllegalStateException("Tenant secret encryption unavailable");
    }
  }

  public String decrypt(String value) {
    try {
      if (value == null || !value.startsWith("tenant-v1:")) throw new IllegalArgumentException();
      byte[] bytes = Base64.getDecoder().decode(value.substring(10));
      if (bytes.length < 29) throw new IllegalArgumentException();
      return new String(
          cipher(Cipher.DECRYPT_MODE, Arrays.copyOf(bytes, 12))
              .doFinal(bytes, 12, bytes.length - 12),
          StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new IllegalStateException("Tenant secret decryption unavailable");
    }
  }

  private Cipher cipher(int mode, byte[] nonce) throws Exception {
    byte[] bytes = Base64.getDecoder().decode(key);
    if (bytes.length != 32) throw new IllegalArgumentException();
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(mode, new SecretKeySpec(bytes, "AES"), new GCMParameterSpec(128, nonce));
    cipher.updateAAD("ems-tenant-v1".getBytes(StandardCharsets.US_ASCII));
    return cipher;
  }
}
