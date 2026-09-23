package com.enerlution.ems.common;

/** Response convention adapted from RuoYi-Vue-Plus R.java; see LICENSE.ruoyi. */
public record ApiResponse<T>(int code, String msg, T data) {
  public static <T> ApiResponse<T> ok(T data) {
    return new ApiResponse<>(200, "Success", data);
  }
}
