#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/x509.h>
#include <mosquitto.h>
#include <mosquitto_broker.h>
#include <mosquitto_plugin.h>

#define CHECK(condition) do { if (!(condition)) { \
    fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #condition); exit(1); \
} } while (0)

struct mosquitto {
    const char *id;
    char *username;
    X509 *certificate;
    int protocol_version;
};

static MOSQ_FUNC_generic_callback registered_callback;
static void *registered_userdata;

const char *mosquitto_client_id(const struct mosquitto *client) { return client->id; }
int mosquitto_client_protocol_version(const struct mosquitto *client) { return client->protocol_version; }
void *mosquitto_client_certificate(const struct mosquitto *client) {
    if (!client->certificate) return NULL;
    CHECK(X509_up_ref(client->certificate) == 1);
    return client->certificate;
}
int mosquitto_set_username(struct mosquitto *client, const char *username) {
    char *copy = strdup(username);
    if (!copy) return MOSQ_ERR_NOMEM;
    free(client->username);
    client->username = copy;
    return MOSQ_ERR_SUCCESS;
}
void *mosquitto_calloc(size_t count, size_t size) { return calloc(count, size); }
void mosquitto_free(void *pointer) { free(pointer); }
int mosquitto_callback_register(mosquitto_plugin_id_t *id, int event,
        MOSQ_FUNC_generic_callback callback, const void *event_data, void *userdata) {
    (void)id; (void)event_data;
    CHECK(event == MOSQ_EVT_BASIC_AUTH);
    registered_callback = callback;
    registered_userdata = userdata;
    return MOSQ_ERR_SUCCESS;
}
int mosquitto_callback_unregister(mosquitto_plugin_id_t *id, int event,
        MOSQ_FUNC_generic_callback callback, const void *event_data) {
    (void)id; (void)event_data;
    CHECK(event == MOSQ_EVT_BASIC_AUTH && callback == registered_callback);
    registered_callback = NULL;
    registered_userdata = NULL;
    return MOSQ_ERR_SUCCESS;
}

#include "ems_identity.c"

static X509 *certificate(const unsigned char *cn, int length, int duplicate) {
    X509 *cert = X509_new();
    X509_NAME *name = X509_NAME_new();
    CHECK(cert && name);
    if (cn) {
        CHECK(X509_NAME_add_entry_by_NID(name, NID_commonName, MBSTRING_UTF8,
            cn, length, -1, 0) == 1);
        if (duplicate) CHECK(X509_NAME_add_entry_by_NID(name, NID_commonName,
            MBSTRING_UTF8, cn, length, -1, 0) == 1);
    }
    CHECK(X509_set_subject_name(cert, name) == 1);
    X509_NAME_free(name);
    return cert;
}

static void authenticate_case(const char *client_id, X509 *cert, int protocol,
        int expected, const char *expected_username) {
    struct mosquitto client = {client_id, strdup("forged-cloud-user"), cert, protocol};
    struct mosquitto_evt_basic_auth event = {0};
    event.client = &client;
    event.username = client.username;
    CHECK(registered_callback(MOSQ_EVT_BASIC_AUTH, &event, registered_userdata) == expected);
    if (expected_username) CHECK(strcmp(client.username, expected_username) == 0);
    free(client.username);
    X509_free(cert);
}

int main(void) {
    const char *uuid = "755facdc-9bdf-43d0-9412-c94f860a01ec";
    const char *cloud = "ems-cloud-v3-ingestion";
    const int supported[] = {4, 5};
    const int unsupported[] = {4};
    void *userdata = NULL;
    CHECK(mosquitto_plugin_version(2, supported) == 5);
    CHECK(mosquitto_plugin_version(1, unsupported) == -1);
    CHECK(mosquitto_plugin_init((mosquitto_plugin_id_t *)(uintptr_t)1,
        &userdata, NULL, 0) == MOSQ_ERR_SUCCESS);
    CHECK(registered_callback != NULL);

    authenticate_case(uuid, certificate((const unsigned char *)uuid, -1, 0), 4,
        MOSQ_ERR_SUCCESS, uuid);
    authenticate_case(cloud, certificate((const unsigned char *)cloud, -1, 0), 4,
        MOSQ_ERR_SUCCESS, cloud);
    authenticate_case("different-client", certificate((const unsigned char *)uuid, -1, 0),
        4, MOSQ_ERR_AUTH, NULL);
    authenticate_case(NULL, certificate((const unsigned char *)uuid, -1, 0),
        4, MOSQ_ERR_AUTH, NULL);
    authenticate_case(uuid, NULL, 4, MOSQ_ERR_AUTH, NULL);
    authenticate_case(uuid, certificate(NULL, 0, 0), 4, MOSQ_ERR_AUTH, NULL);
    authenticate_case(uuid, certificate((const unsigned char *)uuid, -1, 1),
        4, MOSQ_ERR_AUTH, NULL);
    authenticate_case(uuid, certificate((const unsigned char *)uuid, -1, 0),
        3, MOSQ_ERR_AUTH, NULL);
    const char *invalid[] = {
        "755FACDC-9BDF-43D0-9412-C94F860A01EC",
        "755facdc-9bdf-13d0-9412-c94f860a01ec",
        "755facdc-9bdf-43d0-7412-c94f860a01ec",
        "ems-cloud-other", "../admin", "#", "+"
    };
    for (size_t i = 0; i < sizeof(invalid) / sizeof(invalid[0]); i++) {
        authenticate_case(invalid[i], certificate((const unsigned char *)invalid[i], -1, 0),
            4, MOSQ_ERR_AUTH, NULL);
    }
    unsigned char embedded_nul[40];
    memcpy(embedded_nul, uuid, 36);
    embedded_nul[36] = 0;
    memcpy(embedded_nul + 37, "bad", 3);
    authenticate_case(uuid, certificate(embedded_nul, 40, 0), 4, MOSQ_ERR_AUTH, NULL);
    CHECK(mosquitto_plugin_cleanup(userdata, NULL, 0) == MOSQ_ERR_SUCCESS);
    CHECK(registered_callback == NULL);
    puts("PASS: certificate identity, original ClientID, username replacement and cleanup");
    return 0;
}
