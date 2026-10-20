import { Field } from "./Common";
import { Switch } from "./RuntimeParametersPage";
import { type Device, type ProvisionDraft, type CommunicationPort, } from "./model";
import { isStructure } from "./topologyModel";
import { assignEms, availableEmus, configureDcPv, hasDcPv, portKind, setEmsPortType, setOperationEnabled, forwardingCandidates, assignCabinetMember, renameEmsPort, type ProvisionModel, } from "./deviceConfiguration";
import ModelField from "./ModelField";
import { enabledValue, measurementFor } from "./topologyContract";
export default function DeviceInspector({ device, draft, patch, change, models, mode, }: {
    device: Device;
    draft: ProvisionDraft;
    models: ProvisionModel[];
    mode?: "electrical" | "communication";
    patch: (id: string, values: Partial<Device>) => void;
    change: (values: Partial<ProvisionDraft>) => void;
}) {
    const set = (key: keyof Device, value: string | boolean) => patch(device.id, {
        [key]: value
    });
    const input = (key: keyof Device, label: string, type = "text") => (<Field label={label}>
      <input data-device-field={`${device.id}:${key}`} type={type} value={String(key === "code" ? (device.nodeId ?? device.id) : device[key] ?? "")} readOnly={key === "code"} onChange={key === "code" ? undefined : (e) => set(key, e.target.value)}/>
    </Field>);
    const ems = draft.devices.find((n) => n.id === device.emsId && n.type === "EMS");
    const select = (key: keyof Device, label: string, options: {
        id: string;
        name: string;
    }[]) => (<Field label={label}>
      <select data-device-field={`${device.id}:${key}`} value={String(device[key] ?? "")} onChange={(e) => key === "emsId" && !device.id.includes(":")
            ? change(assignEms(draft, device.id, e.target.value))
            : set(key, e.target.value)}>
        <option value="">请选择</option>
        {options.map((o) => (<option key={o.id} value={o.id}>
            {o.name}
          </option>))}
      </select>
    </Field>);
    const relation = (<>
      <h3>连接关系</h3>
      <p>
        {draft.connections
            ?.filter((e) => e.from === device.id || e.to === device.id)
            .map((e) => draft.devices.find((n) => n.id === (e.from === device.id ? e.to : e.from))?.code)
            .join("、") || "尚未连接"}
      </p>
    </>);
    const toggle = (key: keyof Device, label: string) => <Field label={label}><select data-device-field={device.id + ':' + key} value={key === 'enabled' ? enabledValue(device) : String(device[key])} onChange={e => patch(device.id, {
            [key]: e.target.value === 'true', ...(key === 'enabled' ? {
                enabledState: e.target.value as 'true' | 'false'
            } : {})
        })}><option value="Unspecified">Unspecified（尚未确定）</option><option value="true">启用</option><option value="false">停用</option></select></Field>;
    const measurementFields = () => {
        const measurement = measurementFor(device);
        return <><h3>测量位置与正方向</h3><Field label="测量线路"><select data-device-field={device.id + ':measurement'} value={measurement?.measuredObjectRef ?? ''} onChange={e => patch(device.id, {
                measurement: {
                    measuredObjectRef: e.target.value, positiveDirection: measurement?.positiveDirection ?? 'Unspecified'
                }
            })}><option value="">请选择电气连线</option>{draft.connections?.map(w => <option key={w.id} value={w.id}>{w.id} · {draft.devices.find(n => n.id === w.from)?.name ?? w.from} → {draft.devices.find(n => n.id === w.to)?.name ?? w.to}</option>)}</select></Field><Field label="功率正方向"><select data-device-field={device.id + ':positiveDirection'} value={measurement?.positiveDirection ?? 'Unspecified'} onChange={e => patch(device.id, {
                measurement: {
                    measuredObjectRef: measurement?.measuredObjectRef ?? '', positiveDirection: e.target.value as 'Endpoint1To2' | 'Endpoint2To1'
                }
            })}><option value="Unspecified">Unspecified（尚未确定）</option><option value="Endpoint1To2">Endpoint1 → Endpoint2</option><option value="Endpoint2To1">Endpoint2 → Endpoint1</option></select></Field></>;
    };
    const nested = (key: "metering" | "coolingConfiguration", type: Device["type"]) => {
        const config = device[key] ?? {};
        const child = {
            ...device,
            ...config,
            id: device.id + (key === "metering" ? ":meter" : ":tms"),
            type: key === 'coolingConfiguration' ? '温控设备' : type,
            nodeId: config.nodeId ?? device.id + (key === 'metering' ? ':meter' : ':tms'),
            modelId: config.modelId,
            modelCode: config.modelCode ?? '',
            manufacturer: config.manufacturer ?? '',
            enabled: config.enabled,
            enabledState: config.enabledState,
            controlPermission: config.controlPermission,
            emsId: config.emsId ?? device.emsId,
            model: config.model ?? "",
            protocol: config.protocol ?? "",
            interface: config.interface ?? "",
            ip: config.ip ?? "",
            port: config.port ?? "502",
            address: config.address ?? "1",
            name: config.name ?? (key === "metering" ? "计量电表" : "液冷 TMS"),
            code: config.code ?? device.code + (key === "metering" ? "-M" : "-TMS"),
            access: config.access ?? (key === "metering" ? "EMS" : "设备转发"),
            forwardDeviceId: config.forwardDeviceId ?? device.id,
            cabinetId: undefined,
            cooling: false,
            metering: undefined,
            coolingConfiguration: undefined,
        } as Device;
        const patchChild = (_: string, values: Partial<Device>) => patch(device.id, {
            [key]: {
                ...config, ...values
            }
        });
        return (<details className="ems-interface" open>
        <summary>
          {key === "metering" ? "计量电表" : "液冷"} · {child.code}
        </summary>
        <DeviceInspector device={child} draft={draft} patch={patchChild} change={change} models={models} mode={mode}/>
      </details>);
    };
    if (mode === "electrical") {
        if (device.type === "EMS")
            return (<>
          <h2>{device.code} · EMS</h2>
          <p>EMS 的身份、接口和设备接入在通信拓扑配置。</p>
        </>);
        if (device.type === "标准柜")
            return (<>
          <h2>标准柜 · {device.code}</h2>
          <div className="inspector-pair">
            {input("code", "标准柜编号")}
            {input("cabinetNumber", "柜号")}
          </div>
          <h3>柜内设备</h3>
          <Field label="添加已有设备">
            <select value="" onChange={(e) => {
                    if (e.target.value)
                        change(assignCabinetMember(draft, device.id, e.target.value, true));
                }}>
              <option value="">请选择未归柜设备</option>
              {draft.devices
                    .filter((n) => !n.cabinetId &&
                    ["PCS", "电池 / BMS", "光伏 DC/DC", "直流母线"].includes(n.type))
                    .map((n) => (<option key={n.id} value={n.id}>
                    {n.code} · {n.name}
                  </option>))}
            </select>
          </Field>
          {draft.devices
                    .filter((n) => n.cabinetId === device.id && !["直流母线"].includes(n.type))
                    .map((n) => (<details className="ems-interface" key={n.id}>
                <summary>
                  {n.type} · {n.code}
                </summary>
                <DeviceInspector device={n} draft={draft} patch={patch} change={change} models={models} mode="electrical"/>
                <button className="station-text-button" onClick={() => change(assignCabinetMember(draft, device.id, n.id, false))}>
                  移出标准柜
                </button>
              </details>))}
          {relation}
        </>);
        return (<>
        <h2>{device.name}</h2>{isStructure(device) && toggle("enabled", "启用配置")}
        <div className="inspector-pair">
          {input("code", "设备编号")}
          {input("name", "设备名称")}
        </div>
        {!isStructure(device) && (<>
            {toggle("enabled", "启用设备")}
            <ModelField device={device} cooling={device.id.endsWith(":tms")} models={models} patch={patch}/>
            {["PCS", "光伏 DC/DC", "AC充电桩", "DC充电桩", "充电桩"].includes(device.type) && input("rating", "功率上限（kW）", "number")}
          </>)}
        {["电网", "光伏", "ATS"].includes(device.type) && (<>
            <Field label="配置电表">
              <Switch label="配置电表" value={!!device.metering} onChange={(v) => patch(device.id, {
                    metering: v
                        ? (device.metering ?? {
                            enabled: true
                        })
                        : undefined,
                })}/>
            </Field>
            {device.metering && nested("metering", "电表")}
          </>)}
        {device.type === "光伏 DC/DC" && (<Field label="配置 DC PV">
            <Switch label="配置 DC PV" value={hasDcPv(device)} onChange={(v) => patch(device.id, configureDcPv(device, v))}/>
          </Field>)}
        {device.type === "电池 / BMS" && !device.id.endsWith(":tms") && (<>
            <Field label="内置 EMU 编号"><input readOnly data-device-field={device.id + ":emuCode"} value={device.nodeId ?? device.id}/></Field>
            <Field label="存在液冷系统">
              <Switch label="存在液冷系统" value={!!device.cooling} onChange={(v) => patch(device.id, {
                    cooling: v,
                    coolingConfiguration: device.coolingConfiguration ?? {
                        enabled: true,
                    },
                })}/>
            </Field>
            {device.cooling && nested("coolingConfiguration", "电池 / BMS")}
          </>)}
        {['电表', '光伏侧电表'].includes(device.type) && measurementFields()}
        {relation}
        <h3>通信状态</h3>
        <p>
          {device.access === "设备转发"
                ? "经 " +
                    (draft.devices.find((n) => n.id === device.forwardDeviceId)
                        ?.code ?? "未选择设备")
                : device.interface || "待配置"}
        </p>
      </>);
    }
    if (isStructure(device))
        return (<>
        <h2>
          {device.code} · {device.name}
        </h2>
        {input("name", "节点名称")}
        {input("code", "节点编号")}
        <p>仅保存电气连接，无需电压、通信或设备绑定。</p>
        {device.metering && nested("metering", "电表")}
        {relation}
      </>);
    if (device.type === "EMS") {
        const update = (index: number, values: Partial<CommunicationPort>) => patch(device.id, {
            ports: device.ports?.map((p, i) => i === index ? {
                ...p, ...values
            } : p),
        });
        return (<>
        <h2>{device.name}</h2>
        <div className="inspector-pair">
          {input("code", "控制器编号")}
          {input("name", "控制器名称")}
        </div>
        {toggle("enabled", "启用 EMS")}
        <ModelField device={device} models={models} patch={patch}/>
        <div className="inspector-pair">
          {input("emsNumber", "EMS 编号")}
          {select("emsRole", "运行角色", [
                {
                    id: "standalone", name: "单机"
                },
                {
                    id: "master", name: "主机"
                },
                {
                    id: "slave", name: "从机"
                },
            ])}
        </div>
        {device.emsRole === "slave" &&
                select("masterEmsId", "上级主机", draft.devices
                    .filter((n) => n.type === "EMS" &&
                    n.id !== device.id &&
                    n.emsRole === "master")
                    .map((n) => ({
                    id: n.id, name: n.code ?? n.name
                })))}
        <Field label="其他 EMS / Peers">
          {draft.devices
                .filter((n) => n.type === "EMS" && n.id !== device.id)
                .map((n) => (<label key={n.id}>
                <input type="checkbox" checked={device.peerEmsIds?.includes(n.id) ?? false} onChange={(e) => patch(device.id, {
                    peerEmsIds: e.target.checked
                        ? [...(device.peerEmsIds ?? []), n.id]
                        : (device.peerEmsIds ?? []).filter((id) => id !== n.id),
                })}/>
                {n.code}
              </label>))}
          {draft.devices.filter((n) => n.type === "EMS" && n.id !== device.id)
                .length === 0 && <span>无</span>}
        </Field>
        <h3>其他 EMS / Peers 详情 <button onClick={() => patch(device.id, {
                emsPeers: [...(device.emsPeers ?? []), {
                        id: '', no: '', role: 'Slave', host: '', port: '502'
                    }]
            })}>＋</button></h3>{device.emsPeers?.map((peer, i) => <details className="ems-interface" open key={i}><summary>{peer.id || '未配置 Peer'}</summary>{(['id', 'no', 'host', 'port'] as const).map(key => <Field key={key} label={{
                        id: 'Peer 节点 ID', no: 'Peer EMS 编号', host: 'Peer 主机 IP', port: 'Peer TCP 端口'
                    }[key]}><input data-device-field={device.id + ':emsPeers'} value={peer[key]} onChange={e => patch(device.id, {
                        emsPeers: device.emsPeers?.map((p, j) => j === i ? {
                            ...p, [key]: e.target.value
                        } : p)
                    })}/></Field>)}<Field label="Peer 运行角色"><select value={peer.role} onChange={e => patch(device.id, {
                    emsPeers: device.emsPeers?.map((p, j) => j === i ? {
                        ...p, role: e.target.value as 'Master' | 'Slave' | 'Standalone'
                    } : p)
                })}><option>Master</option><option>Slave</option><option>Standalone</option></select></Field><button onClick={() => patch(device.id, {
                    emsPeers: device.emsPeers?.filter((_, j) => j !== i)
                })}>移除 Peer</button></details>)}
        {!mode && <div className="inspector-pair">
          {input("ip", "本机 IP")}
          {input("subnet", "子网掩码")}
        </div>}
        <h3>
          下行接口{" "}
          <button aria-label="添加 EMS 接口" onClick={() => {
                let number = 1;
                while (device.ports?.some((p) => p.id === `接口-${number}`))
                    number++;
                patch(device.id, {
                    ports: [
                        ...(device.ports ?? []),
                        {
                            id: `接口-${number}`,
                            kind: "",
                            interface: "",
                            protocol: "",
                            role: "客户端 / 主站",
                            ip: "",
                            port: "502",
                            address: "1",
                            version: "",
                            targets: [],
                            baud: "9600",
                            parity: "偶校验",
                            bits: "8 / 1",
                            subnet: "255.255.255.0",
                        },
                    ],
                });
            }}>
            ＋
          </button>
        </h3>
        {device.ports?.map((p, i) => (<details key={i} className="ems-interface" data-device-field={device.id + ':ports:' + p.id} tabIndex={-1} open>
            <summary>
              {p.id} · {portKind(p) || "请选择接口类型"}
            </summary>
            <div className="inspector-pair">
              <Field label={`${p.id} 接口 ID`}>
                <input value={p.id} onChange={(e) => {
                    const next = e.target.value;
                    change(renameEmsPort(draft, device.id, p.id, next));
                }}/>
              </Field>
              <Field label={`${p.id} 接口类型`}>
                <select value={portKind(p)} onChange={(e) => change(setEmsPortType(draft, device.id, i, e.target
                    .value as NonNullable<CommunicationPort["kind"]>))}>
                  <option value="">请选择接口类型</option>
                  <option value="ETH">网口（ETH）</option>
                  <option value="RS485">串口（RS485）</option>
                  <option value="DI">数字输入（DI）</option>
                  <option value="CAN">CAN（预留）</option>
                </select>
              </Field>
            </div>
            <Field label={`${p.id} 接口名称`}><input value={p.name ?? ''} onChange={e => update(i, {
                    name: e.target.value
                })}/></Field>
            <Field label="启用接口"><select value={enabledValue(p)} onChange={e => update(i, {
                    enabled: e.target.value === 'true', enabledState: e.target.value as 'true' | 'false'
                })}><option value="Unspecified">Unspecified（尚未确定）</option><option value="true">启用</option><option value="false">停用</option></select></Field>
            <Field label="接口用途">
              <select value={p.purpose ?? "device"} onChange={(e) => update(i, {
                    purpose: e.target.value as CommunicationPort["purpose"],
                })}>
                <option value="device">设备通信</option>
                <option value="uplink">上行平台</option>
                <option value="peer">EMS Peers</option>
                <option value="reserved">预留</option>
              </select>
            </Field>
            {portKind(p) === "CAN" && <p>CAN 为预留接口，暂不接入设备。</p>}
            {portKind(p) && (<>
                {portKind(p) === "ETH" && (<Field label="地址分配">
                    <select value={p.dhcp ? "dhcp" : "static"} onChange={(e) => update(i, {
                            dhcp: e.target.value === "dhcp"
                        })}>
                      <option value="static">静态 IP</option>
                      <option value="dhcp">DHCP 自动获取</option>
                    </select>
                  </Field>)}
                <Field label={`${p.id} 物理接口`}>
                  <input value={p.interface} onChange={(e) => update(i, {
                        kind: portKind(p),
                        interface: e.target.value,
                    })}/>
                </Field>
                {portKind(p) === "ETH" ? (<div className="inspector-pair">
                    <Field label={`${p.id} IP 地址`}>
                      <input value={p.ip} onChange={(e) => update(i, {
                            ip: e.target.value
                        })}/>
                    </Field>
                    <Field label={`${p.id} 子网掩码`}>
                      <input value={p.subnet ?? ""} onChange={(e) => update(i, {
                            subnet: e.target.value
                        })}/>
                    </Field>
                  </div>) : portKind(p) === "RS485" ? (<div className="inspector-pair">
                    {([
                            [
                                "baud",
                                "波特率",
                                [
                                    "1200",
                                    "2400",
                                    "4800",
                                    "9600",
                                    "19200",
                                    "38400",
                                    "57600",
                                    "115200",
                                ],
                            ],
                            ["parity", "校验位", ["无校验", "奇校验", "偶校验"]],
                            ["bits", "数据位 / 停止位", ["8 / 1", "8 / 2", "7 / 1"]],
                        ] as const).map(([key, label, options]) => (<Field key={key} label={`${p.id} ${label}`}>
                        <select value={p[key] ?? ""} onChange={(e) => update(i, {
                                [key]: e.target.value
                            })}>
                          {options.map((x) => (<option key={x}>{x}</option>))}
                        </select>
                      </Field>))}
                  </div>) : null}
              </>)}
            <button className="station-text-button station-danger" onClick={() => change({
                    devices: draft.devices.map((n) => n.id === device.id
                        ? {
                            ...n, ports: n.ports?.filter((_, j) => j !== i)
                        }
                        : n.emsId === device.id && n.interface === p.id
                            ? {
                                ...n, interface: ""
                            }
                            : n),
                })}>
              移除此接口
            </button>
          </details>))}
        <p>EMS 不参与电气连接。更改接口后请重新校验接入设备。</p>
      </>);
    }
    const dcdc = device.type === "光伏 DC/DC";
    const configured = !dcdc || hasDcPv(device);
    const nonConnected = device.enabled === false || device.access === "不接入";
    return (<>
      <h2>
        {device.code} · {device.name}
      </h2>{mode === 'communication' && toggle('enabled', '启用设备')}
      <div className="inspector-pair">
        {input("code", "设备编号")}
        {device.cabinetId ? (<Field label="所属 EMS">
            <input readOnly value={ems?.code ?? "未选择 EMS"}/>
          </Field>) : (select("emsId", "所属 EMS", draft.devices
            .filter((n) => n.type === "EMS")
            .map((n) => ({
            id: n.id, name: n.code ?? n.name
        }))))}
      </div>
      {dcdc && (<Field label="配置 DC PV">
          <Switch label="配置 DC PV" value={hasDcPv(device)} onChange={(v) => patch(device.id, configureDcPv(device, v))}/>
        </Field>)}
      {configured && (<>
          {device.type === "电池 / BMS" && input("name", "节点名称")}
          {!mode && (<ModelField device={device} models={models} patch={patch}/>)}
          {!mode && (<div className={dcdc ? "inspector-pair" : undefined}>
              <Field label={dcdc ? "运行使能" : "类别启用"}>
                <Switch label={dcdc ? "运行使能" : `启用 ${device.code}`} value={device.enabled !== false} onChange={(v) => patch(device.id, setOperationEnabled(device, v))}/>
              </Field>
              {["PCS", "光伏 DC/DC"].includes(device.type) &&
                    input("rating", dcdc ? "功率上限（kW）" : "有功功率上限（kW）", "number")}
            </div>)}
          <h3>通信接入</h3>
          {select("access", "接入方式", [
                {
                    id: "EMS", name: "直接接入"
                },
                {
                    id: "设备转发", name: "设备转发"
                },
                ...(device.type !== "电池 / BMS"
                    ? [{
                            id: "EMU", name: "EMU"
                        }]
                    : []),
                {
                    id: "不接入", name: "不接入"
                },
            ])}
          {device.access === "设备转发"
                ? select("forwardDeviceId", "转发设备", forwardingCandidates(draft, device).map((n) => ({
                    id: n.id,
                    name: n.code ?? n.name,
                })))
                : device.access === "EMU"
                    ? select("emuId", "关联 EMU", availableEmus(draft, device).map((n) => ({
                        id: n.id,
                        name: n.code ?? n.name,
                    })))
                    : !nonConnected && (<>
                    <div className="inspector-pair">
                      <Field label="通信协议">
                        <select data-device-field={`${device.id}:protocol`} value={device.protocol} onChange={(e) => patch(device.id, {
                            protocol: e.target.value,
                            access: "EMS",
                            interface: "",
                        })}>
                          <option value="">请选择</option>
                          <option>Modbus TCP</option>
                          <option>Modbus RTU</option>
                          <option>DI</option>
                        </select>
                      </Field>
                      {select("interface", "接入接口", (ems?.ports ?? [])
                            .filter((p) => p.enabled !== false && p.purpose !== "reserved")
                            .filter((p) => portKind(p) ===
                            (device.protocol === "Modbus TCP"
                                ? "ETH"
                                : device.protocol === "Modbus RTU"
                                    ? "RS485"
                                    : device.protocol === "DI"
                                        ? "DI"
                                        : null))
                            .map((p) => ({
                            id: p.id,
                            name: `${ems?.code} / ${p.id}`,
                        })))}
                    </div>
                    {device.protocol === "Modbus TCP" ? (<>
                        <div className="inspector-pair">
                          {input("ip", "设备 IP 地址")}
                          {input("port", "TCP 端口", "number")}
                        </div>
                        {input("address", "Unit ID", "number")}
                      </>) : (device.protocol === "Modbus RTU" && (<>
                          {input("address", "从站地址", "number")}
                          <p>
                            使用所选 EMS 接口的串口参数：
                            {ems?.ports?.find((p) => p.id === device.interface)
                                ?.baud ?? "—"}{" "}
                            bps ·{" "}
                            {ems?.ports?.find((p) => p.id === device.interface)
                                ?.parity ?? "—"}{" "}
                            ·{" "}
                            {ems?.ports?.find((p) => p.id === device.interface)
                                ?.bits ?? "—"}
                          </p>
                        </>))}
                  </>)}
          {!mode &&
                device.type === "电池 / BMS" &&
                !device.id.endsWith(":tms") && (<>
                <Field label="存在液冷系统">
                  <Switch label="存在液冷系统" value={!!device.cooling} onChange={(v) => set("cooling", v)}/>
                </Field>
                {device.cooling && (<>
                    <ModelField device={device} cooling models={models} patch={patch}/>
                    <Field label="液冷接入方式">
                      <input readOnly value="EMU"/>
                    </Field>
                  </>)}
              </>)}
          <Field label="控制权限"><select data-device-field={device.id + ':controlPermission'} value={device.controlPermission ?? 'Unspecified'} onChange={e => patch(device.id, {
                controlPermission: e.target.value === 'Unspecified' ? undefined : e.target.value as 'collect' | 'control'
            })}><option value="Unspecified">Unspecified（尚未确定）</option><option value="collect">只采集（controlEnabled=false）</option><option value="control" disabled={device.protocol === 'DI' || device.access === '不接入'}>允许控制（controlEnabled=true）</option></select></Field>
      {device.protocol === 'DI' && device.access === 'EMS' && <><Field label="DI 有效电平"><select data-device-field={device.id + ':digitalInput'} value={device.digitalInput?.activeLevel ?? 'Unspecified'} onChange={e => patch(device.id, {
                    digitalInput: {
                        activeLevel: e.target.value as 'High' | 'Low', signalMeaning: device.digitalInput?.signalMeaning ?? ''
                    }, controlPermission: 'collect'
                })}><option value="Unspecified">Unspecified（尚未确定）</option><option value="High">高电平有效</option><option value="Low">低电平有效</option></select></Field><Field label="DI 信号含义"><input value={device.digitalInput?.signalMeaning ?? ''} onChange={e => patch(device.id, {
                    digitalInput: {
                        activeLevel: device.digitalInput?.activeLevel ?? 'Unspecified', signalMeaning: e.target.value
                    }
                })}/></Field></>}
      <p>
            {device.controlPermission === "control" ? "采集与控制" : device.controlPermission === 'collect' ? "只采集" : "控制权限尚未确定"}
          </p>
          {device.metering && nested("metering", "电表")}
          {device.cooling &&
                device.coolingConfiguration &&
                nested("coolingConfiguration", "电池 / BMS")}
          {relation}
        </>)}
    </>);
}
