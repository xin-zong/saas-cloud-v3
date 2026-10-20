import type { CommunicationPort, Device, ProvisionDraft } from "./model";
// Legacy DCDC drafts used enabled for whether DC PV existed at all.
export const hasDcPv = (device: Device) => device.dcPvConfigured ?? device.enabled !== false;
export const configureDcPv = (device: Device, value: boolean): Partial<Device> => ({
    dcPvConfigured: value,
    enabled: device.dcPvConfigured === undefined ? true : device.enabled,
    enabledState: device.dcPvConfigured === undefined ? "true" : device.enabledState,
});
export const setOperationEnabled = (device: Device, value: boolean): Partial<Device> => ({
    enabled: value,
    enabledState: value ? "true" : "false",
    ...(device.type === "光伏 DC/DC" ? {
        dcPvConfigured: hasDcPv(device)
    } : {}),
});
export const portKind = (port: CommunicationPort) => port.kind ??
    (port.interface.startsWith("ETH")
        ? "ETH"
        : port.interface.startsWith("RS485")
            ? "RS485"
            : port.interface.startsWith("DI")
                ? "DI"
                : port.interface.startsWith("CAN")
                    ? "CAN"
                    : "");
export function availableEmus(draft: ProvisionDraft, device: Device) {
    return draft.devices.filter((n) => n.type === "电池 / BMS" &&
        n.id !== device.id &&
        !!device.emsId &&
        n.emsId === device.emsId &&
        n.enabled !== false);
}
export function setEmsPortType(draft: ProvisionDraft, emsId: string, index: number, kind: NonNullable<CommunicationPort["kind"]>) {
    const ems = draft.devices.find((n) => n.id === emsId);
    const before = ems?.ports?.[index];
    if (!ems || !before)
        return {
            devices: draft.devices
        };
    const names = new Set(ems.ports?.filter((_, i) => i !== index).map((p) => p.id));
    let number = 1;
    const hardwareId = (value: number) => kind === "RS485" ? `RS485_${value}` : kind ? `${kind}${value}` : `接口-${value}`;
    while (names.has(hardwareId(number)))
        number++;
    const next = hardwareId(number);
    return {
        devices: draft.devices.map((n) => n.id === emsId
            ? {
                ...n,
                ports: n.ports?.map((p, i) => i === index
                    ? {
                        ...p,
                        id: next,
                        kind,
                        interface: kind ? next : "",
                        protocol: kind === "ETH"
                            ? "Modbus TCP"
                            : kind === "RS485"
                                ? "Modbus RTU"
                                : kind === "DI"
                                    ? "DI"
                                    : "",
                    }
                    : p),
            }
            : n.emsId === emsId && n.interface === before.id
                ? {
                    ...n, interface: ""
                }
                : n),
    };
}
export function assignEms(draft: ProvisionDraft, id: string, emsId: string) {
    const affected = new Set(draft.devices
        .filter((n) => n.id === id || n.cabinetId === id)
        .map((n) => n.id));
    return {
        devices: draft.devices.map((n) => {
            if (!affected.has(n.id) || n.emsId === emsId)
                return n;
            const emu = draft.devices.find((b) => b.id === n.emuId);
            const forward = draft.devices.find((b) => b.id === n.forwardDeviceId);
            return {
                ...n,
                emsId,
                interface: "",
                forwardDeviceId: forward && (affected.has(forward.id) || forward.emsId === emsId)
                    ? forward.id
                    : "",
                emuId: emu && (affected.has(emu.id) || emu.emsId === emsId) ? emu.id : "",
            };
        }),
    };
}
export type ProvisionModel = {
    modelCode?: string;
    id: number | string;
    manufacturer: string;
    name: string;
    category: string;
};
const categories: Partial<Record<Device["type"], string>> = {
    温控设备: "HVAC",
    EMS: "EMS",
    ATS: "ATS",
    AC充电桩: "EV",
    DC充电桩: "EV",
    PCS: "PCS",
    "电池 / BMS": "BMS",
    电表: "MTR",
    光伏侧电表: "MTR",
    光伏: "PV",
    "光伏 DC/DC": "DCDC",
    柴油发电机: "DG",
    充电桩: "EV",
    可控负载: "LOAD",
};
export function modelsForDevice(models: ProvisionModel[], type: Device["type"], cooling = false) {
    return models.filter((model) => model.category === (cooling ? "HVAC" : categories[type]));
}
export function forwardingCandidates(draft: ProvisionDraft, device: Device) {
    return draft.devices
        .filter((n) => n.id !== device.id &&
        n.emsId === device.emsId &&
        !!device.emsId &&
        n.enabled !== false &&
        ![
            "EMS",
            "标准柜",
            "交流母线",
            "直流母线",
            "电网",
            "不可控负载",
        ].includes(n.type))
        .filter((n) => {
        const seen = new Set([device.id]);
        let current: Device | undefined = n;
        while (current) {
            if (seen.has(current.id))
                return false;
            seen.add(current.id);
            const parent: string | undefined = current.access === "EMU" ? current.emuId : current.forwardDeviceId;
            current = draft.devices.find((x) => x.id === parent);
        }
        return true;
    });
}
export function embeddedCommunicationDevices(draft: ProvisionDraft): Device[] {
    return draft.devices.flatMap((owner) => [
        ...(owner.metering
            ? [{
                    config: owner.metering, suffix: "meter", type: owner.type === "光伏" ? "光伏侧电表" as const : "电表" as const
                }]
            : []),
        ...(owner.cooling && owner.coolingConfiguration
            ? [
                {
                    config: owner.coolingConfiguration,
                    suffix: "tms",
                    type: "温控设备" as const,
                },
            ]
            : []),
    ].map(({ config, suffix, type }) => ({
        ...owner,
        ...config,
        id: owner.id + ":" + suffix,
        code: config.code ?? owner.code + "-" + suffix.toUpperCase(),
        name: config.name ?? (suffix === "meter" ? "计量电表" : "液冷 TMS"),
        type,
        nodeId: config.nodeId ?? owner.id + ":" + suffix,
        modelId: config.modelId,
        modelCode: config.modelCode ?? "",
        manufacturer: config.manufacturer ?? "",
        controlPermission: config.controlPermission,
        enabledState: config.enabledState,
        model: config.model ?? (suffix === "tms" ? owner.coolingModel : "") ?? "",
        protocol: config.protocol ?? "",
        interface: config.interface ?? "",
        ip: config.ip ?? "",
        port: config.port ?? "502",
        address: config.address ?? "1",
        enabled: config.enabled,
        access: config.access ?? (suffix === "tms" ? "设备转发" : "EMS"),
        forwardDeviceId: config.forwardDeviceId ?? (suffix === "tms" ? owner.id : undefined),
        emsId: config.emsId ?? owner.emsId,
        cabinetId: owner.cabinetId,
        ports: [],
        cooling: false,
        metering: undefined,
        coolingConfiguration: undefined,
    })));
}
export function assignCabinetMember(draft: ProvisionDraft, cabinetId: string, deviceId: string, attach: boolean) {
    const cabinet = draft.devices.find((n) => n.id === cabinetId && n.type === "标准柜"), member = draft.devices.find((n) => n.id === deviceId);
    if (!cabinet ||
        !member ||
        !["PCS", "电池 / BMS", "光伏 DC/DC", "直流母线"].includes(member.type))
        return {
            devices: draft.devices
        };
    const aligned = attach
        ? assignEms(draft, deviceId, cabinet.emsId ?? "").devices
        : draft.devices;
    return {
        devices: aligned.map((n) => n.id === deviceId
            ? {
                ...n, cabinetId: attach ? cabinetId : undefined
            }
            : n),
    };
}
/** Rename hardware identity and every reference without changing unrelated port payloads. */
export function renameEmsPort(draft: ProvisionDraft, emsId: string, before: string, next: string): Partial<ProvisionDraft> {
    const nested = (owner: Device, config: Device['metering']) => config && ((config.emsId ?? owner.emsId) === emsId && config.interface === before ? {
        ...config, interface: next
    } : config);
    return {
        devices: draft.devices.map(n => ({
            ...n, interface: n.emsId === emsId && n.interface === before ? next : n.interface, metering: nested(n, n.metering), coolingConfiguration: nested(n, n.coolingConfiguration), ports: n.ports?.map(p => ({
                ...p, ...(n.id === emsId && p.id === before ? {
                    id: next, interface: p.interface === before ? next : p.interface
                } : {}), targets: p.targets.map(t => t === emsId + '/' + before ? emsId + '/' + next : t)
            }))
        }))
    };
}
