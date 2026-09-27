package com.enerlution.ems.protocol;

/** A safe envelope rejection; deliberately excludes raw input and parser causes. */
public final class ProtocolException extends RuntimeException {
    public ProtocolException(String message) { super(message); }
}
