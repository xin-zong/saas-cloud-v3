#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f ems_identity.c ]; then
    echo 'FAIL: certificate identity implementation is missing' >&2
    exit 1
fi
build_dir=$(mktemp -d)
trap 'rm -f "$build_dir/test_identity" "$build_dir/ems_identity.so"; rmdir "$build_dir"' EXIT
cc -std=c11 -Wall -Wextra -Werror -O2 test_identity.c -o "$build_dir/test_identity" -lcrypto
"$build_dir/test_identity"
cc -std=c11 -Wall -Wextra -Werror -O2 -fPIC -shared ems_identity.c \
    -Wl,-z,relro,-z,now -o "$build_dir/ems_identity.so" -lcrypto
echo 'PASS: production plugin builds with warnings treated as errors'
