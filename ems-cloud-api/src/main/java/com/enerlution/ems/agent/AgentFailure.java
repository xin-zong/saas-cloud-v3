package com.enerlution.ems.agent;

final class AgentFailure extends RuntimeException {
  final int status;
  AgentFailure(int status, String message) { super(message); this.status = status; }
}
