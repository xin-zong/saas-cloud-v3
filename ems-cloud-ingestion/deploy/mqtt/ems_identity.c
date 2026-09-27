#include <stdbool.h>
#include <string.h>
#include <openssl/x509.h>
#include <mosquitto.h>
#include <mosquitto_broker.h>
#include <mosquitto_plugin.h>

/* The broker verifies the certificate chain before this authentication callback.
 * require_certificate must be true; both identity rewriting options must be false. */
struct identity_policy {
    mosquitto_plugin_id_t *identifier;
    char cloud_identity[129];
};

static bool uuid_v4(const char *value) {
    if (strlen(value) != 36 || value[14] != '4'
            || !strchr("89ab", value[19])) return false;
    for (int i = 0; i < 36; i++) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (value[i] != '-') return false;
        } else if (!((value[i] >= '0' && value[i] <= '9')
                || (value[i] >= 'a' && value[i] <= 'f'))) {
            return false;
        }
    }
    return true;
}

static bool certificate_identity(const struct mosquitto *client, char identity[129]) {
    X509 *cert = mosquitto_client_certificate(client);
    if (!cert) return false;
    bool valid = false;
    unsigned char *utf8 = NULL;
    X509_NAME *subject = X509_get_subject_name(cert);
    int index = subject ? X509_NAME_get_index_by_NID(subject, NID_commonName, -1) : -1;
    if (index >= 0 && X509_NAME_get_index_by_NID(subject, NID_commonName, index) == -1) {
        X509_NAME_ENTRY *entry = X509_NAME_get_entry(subject, index);
        ASN1_STRING *value = entry ? X509_NAME_ENTRY_get_data(entry) : NULL;
        int length = value ? ASN1_STRING_to_UTF8(&utf8, value) : -1;
        if (length > 0 && length <= 128 && !memchr(utf8, 0, (size_t)length)) {
            memcpy(identity, utf8, (size_t)length);
            identity[length] = '\0';
            valid = true;
        }
    }
    OPENSSL_free(utf8);
    X509_free(cert);
    return valid;
}

static int authenticate(int event, void *event_data, void *userdata) {
    struct identity_policy *policy = userdata;
    struct mosquitto_evt_basic_auth *auth = event_data;
    if (event != MOSQ_EVT_BASIC_AUTH || !policy || !auth || !auth->client)
        return MOSQ_ERR_AUTH;
    if (mosquitto_client_protocol_version(auth->client) != 4) return MOSQ_ERR_AUTH;
    const char *client_id = mosquitto_client_id(auth->client);
    char identity[129];
    if (!client_id || !certificate_identity(auth->client, identity)) return MOSQ_ERR_AUTH;
    if (!uuid_v4(identity) && strcmp(identity, policy->cloud_identity) != 0)
        return MOSQ_ERR_AUTH;
    if (strcmp(client_id, identity) != 0) return MOSQ_ERR_AUTH;
    /* Never let a CONNECT username select a different ACL identity. */
    return mosquitto_set_username(auth->client, identity);
}

static bool valid_cloud_identity(const char *identity) {
    if (!identity || !*identity || strlen(identity) > 128) return false;
    for (const char *c = identity; *c; c++) {
        if (!((*c >= 'a' && *c <= 'z') || (*c >= 'A' && *c <= 'Z')
                || (*c >= '0' && *c <= '9') || *c == '-' || *c == '_' || *c == '.'))
            return false;
    }
    return true;
}

int mosquitto_plugin_version(int count, const int *versions) {
    if (versions) for (int i = 0; i < count; i++) if (versions[i] == 5) return 5;
    return -1;
}

int mosquitto_plugin_init(mosquitto_plugin_id_t *identifier, void **userdata,
        struct mosquitto_opt *options, int option_count) {
    if (!identifier || !userdata || option_count < 0 || (option_count && !options))
        return MOSQ_ERR_INVAL;
    const char *cloud = "ems-cloud-v3-ingestion";
    for (int i = 0; i < option_count; i++) {
        if (!options[i].key || strcmp(options[i].key, "cloud_identity") != 0)
            return MOSQ_ERR_INVAL;
        cloud = options[i].value;
    }
    if (!valid_cloud_identity(cloud)) return MOSQ_ERR_INVAL;
    struct identity_policy *policy = mosquitto_calloc(1, sizeof(*policy));
    if (!policy) return MOSQ_ERR_NOMEM;
    policy->identifier = identifier;
    memcpy(policy->cloud_identity, cloud, strlen(cloud) + 1);
    int result = mosquitto_callback_register(identifier, MOSQ_EVT_BASIC_AUTH,
        authenticate, NULL, policy);
    if (result != MOSQ_ERR_SUCCESS) {
        mosquitto_free(policy);
        return result;
    }
    *userdata = policy;
    return MOSQ_ERR_SUCCESS;
}

int mosquitto_plugin_cleanup(void *userdata, struct mosquitto_opt *options, int option_count) {
    (void)options;
    (void)option_count;
    struct identity_policy *policy = userdata;
    if (!policy) return MOSQ_ERR_SUCCESS;
    int result = mosquitto_callback_unregister(policy->identifier, MOSQ_EVT_BASIC_AUTH,
        authenticate, NULL);
    if (result == MOSQ_ERR_SUCCESS) mosquitto_free(policy);
    return result;
}
