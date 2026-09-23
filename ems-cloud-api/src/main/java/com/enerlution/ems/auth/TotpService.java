package com.enerlution.ems.auth;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** RFC 6238: SHA-1, six digits, thirty seconds. Stored secrets use AES-256-GCM. */
@Component
public class TotpService {
  private final String encryptionKey;
  private final SecureRandom random = new SecureRandom();

  public TotpService(@Value("${ems.auth.mfa-encryption-key:}") String encryptionKey) {
    this.encryptionKey = encryptionKey;
  }

  public long matchCounter(String secret, String code, long epochSeconds) {
    if (code == null || !code.matches("[0-9]{6}")) return -1;
    long current = epochSeconds / 30;
    for (long counter = Math.max(0, current - 1); counter <= current + 1; counter++) {
      try {
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(decodeBase32(secret), "HmacSHA1"));
        byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
        int offset = hash[hash.length - 1] & 15;
        int truncated = ByteBuffer.wrap(hash, offset, 4).getInt() & 0x7fffffff;
        String expected = String.format(java.util.Locale.ROOT, "%06d", truncated % 1_000_000);
        if (MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.US_ASCII), code.getBytes(StandardCharsets.US_ASCII)))
          return counter;
      } catch (Exception ex) {
        throw new IllegalStateException("MFA verification unavailable", ex);
      }
    }
    return -1;
  }

  public String encrypt(String secret) {
    try {
      byte[] nonce = new byte[12];
      random.nextBytes(nonce);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, nonce));
      cipher.updateAAD("ems-totp-v1".getBytes(StandardCharsets.US_ASCII));
      byte[] encrypted = cipher.doFinal(secret.getBytes(StandardCharsets.US_ASCII));
      return "v1:"
          + Base64.getEncoder()
              .encodeToString(
                  ByteBuffer.allocate(nonce.length + encrypted.length)
                      .put(nonce)
                      .put(encrypted)
                      .array());
    } catch (Exception ex) {
      throw new IllegalStateException("MFA encryption unavailable", ex);
    }
  }

  public String decrypt(String value) {
    try {
      if (value == null || !value.startsWith("v1:")) throw new IllegalArgumentException();
      byte[] packed = Base64.getDecoder().decode(value.substring(3));
      if (packed.length < 29) throw new IllegalArgumentException();
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, packed, 0, 12));
      cipher.updateAAD("ems-totp-v1".getBytes(StandardCharsets.US_ASCII));
      return new String(cipher.doFinal(packed, 12, packed.length - 12), StandardCharsets.US_ASCII);
    } catch (Exception ex) {
      throw new IllegalStateException("MFA encryption unavailable", ex);
    }
  }

  private SecretKeySpec key() {
    byte[] bytes = Base64.getDecoder().decode(encryptionKey);
    if (bytes.length != 32)
      throw new IllegalStateException("MFA encryption requires a base64 32-byte key");
    return new SecretKeySpec(bytes, "AES");
  }

  private static byte[] decodeBase32(String input) {
    String value = input.toUpperCase(java.util.Locale.ROOT).replaceAll("=+$", "");
    if (!value.matches("[A-Z2-7]{16,}")) throw new IllegalArgumentException("Invalid TOTP secret");
    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
    int buffer = 0, bits = 0;
    for (char c : value.toCharArray()) {
      buffer = (buffer << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        out.write((buffer >>> bits) & 255);
      }
    }
    return out.toByteArray();
  }
}
