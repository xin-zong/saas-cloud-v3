export type TimePeriod = {
    enabled: boolean;
    start: string;
    end: string;
    days: number[];
    mode: string;
    gridCharge: boolean;
    maxPower: string;
    peakPower: string;
    exportPower: string;
    soc: string;
};
export type RuntimeParameters = {
    mode: string;
    dispatch: string;
    noGridMeter: boolean;
    meterFilter: boolean;
    transformerCapacity: string;
    dischargeSoc: string;
    reserveEnabled: boolean;
    reserveSoc: string;
    forceStartSoc: string;
    forceEndSoc: string;
    peakPower: string;
    exportPower: string;
    chargeLimitEnabled: boolean;
    chargeLimitSoc: string;
    gridPeriods: TimePeriod[];
    peakPeriods: TimePeriod[];
};
export type RuntimeIssue = {
    tab: number;
    field: string;
    message: string;
    period?: number;
};
export function emptyPeriod(): TimePeriod {
    return { enabled: false, start: '00:00', end: '00:00', days: [], mode: '充电', gridCharge: false, maxPower: '0', peakPower: '0', exportPower: '0', soc: '0' };
}
export function defaultRuntime(): RuntimeParameters {
    return { mode: '自发自用', dispatch: 'EMS 调度', noGridMeter: false, meterFilter: true, transformerCapacity: '100', dischargeSoc: '15', reserveEnabled: false, reserveSoc: '10', forceStartSoc: '7', forceEndSoc: '30', peakPower: '5', exportPower: '0', chargeLimitEnabled: true, chargeLimitSoc: '90', gridPeriods: Array.from({ length: 6 }, emptyPeriod), peakPeriods: Array.from({ length: 8 }, emptyPeriod) };
}
export function parseRuntime(raw: unknown): RuntimeParameters {
    const base = defaultRuntime();
    if (!raw || typeof raw !== 'object')
        return base;
    const value = raw as Record<string, unknown>;
    for (const key of Object.keys(base) as (keyof RuntimeParameters)[]) {
        if (key === 'gridPeriods' || key === 'peakPeriods') {
            const rows = value[key];
            if (Array.isArray(rows))
                base[key] = base[key].map((p, i) => {
                    const row = rows[i];
                    if (!row || typeof row !== 'object')
                        return p;
                    const merged = { ...p };
                    for (const k of Object.keys(p) as (keyof TimePeriod)[]) {
                        if (k === 'days')
                            merged.days = Array.isArray(row.days) ? [...new Set<number>(row.days.filter((d: unknown) => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7))] : [];
                        else if (typeof row[k] === typeof p[k])
                            Object.assign(merged, { [k]: row[k] });
                    }
                    return merged;
                });
        }
        else if (typeof value[key] === typeof base[key])
            Object.assign(base, { [key]: value[key] });
    }
    return base;
}
export function validateRuntime(r: RuntimeParameters): RuntimeIssue[] {
    const issues: RuntimeIssue[] = [];
    function number(value: string, label: string, field: string, tab: number, max = Number.MAX_SAFE_INTEGER, period?: number) { if (value.trim() === '' || !Number.isFinite(+value) || +value < 0 || +value > max)
        issues.push({ tab, field, period, message: `${label}应为 0–${max === 100 ? '100%' : max === Number.MAX_SAFE_INTEGER ? '有效上限' : max} 的有效数值` }); }
    number(r.transformerCapacity, '变压器可用容量', 'transformerCapacity', 0);
    for (const [key, label] of [['dischargeSoc', '放电截止 SOC'], ['forceStartSoc', '强充触发 SOC'], ['forceEndSoc', '强充解除 SOC']] as const)
        number(r[key], label, key, 0, 100);
    if (r.reserveEnabled)
        number(r.reserveSoc, '强制保电 SOC', 'reserveSoc', 0, 100);
    if (+r.forceStartSoc >= +r.forceEndSoc)
        issues.push({ tab: 0, field: 'forceStartSoc', message: '强充触发 SOC 必须小于强充解除 SOC' });
    if (r.reserveEnabled && +r.reserveSoc > +r.dischargeSoc)
        issues.push({ tab: 0, field: 'reserveSoc', message: '强制保电 SOC 不能高于放电截止 SOC' });
    if (!['自发自用', '削峰填谷'].includes(r.mode))
        issues.push({ tab: 0, field: 'mode', message: '请选择有效运行模式' });
    number(r.peakPower, '调峰功率', 'peakPower', 1);
    number(r.exportPower, '售电功率', 'exportPower', 1);
    if (r.chargeLimitEnabled)
        number(r.chargeLimitSoc, '充电 SOC 上限', 'chargeLimitSoc', 1, 100);
    const minute = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? +time.slice(0, 2) * 60 + +time.slice(3) : time === '24:00' ? 1440 : NaN;
    for (const [key, tab] of [['gridPeriods', 1], ['peakPeriods', 2]] as const) {
        const rows = r[key];
        rows.forEach((p, index) => {
            if (!p.enabled)
                return;
            const label = `时段 ${String(index + 1).padStart(2, '0')}`;
            if (!Number.isFinite(minute(p.start)) || !Number.isFinite(minute(p.end)) || minute(p.start) >= minute(p.end))
                issues.push({ tab, field: key, period: index, message: `${label}开始时间必须早于结束时间；跨午夜请拆成两个时段` });
            if (!p.days.length)
                issues.push({ tab, field: key, period: index, message: `${label}请选择生效星期` });
            number(p.maxPower, `${label}最大功率`, key, tab, Number.MAX_SAFE_INTEGER, index);
            number(p.soc, `${label}SOC`, key, tab, 100, index);
            if (key === 'peakPeriods') {
                number(p.peakPower, `${label}调峰功率`, key, tab, Number.MAX_SAFE_INTEGER, index);
                number(p.exportPower, `${label}售电功率`, key, tab, Number.MAX_SAFE_INTEGER, index);
            }
            rows.slice(0, index).forEach((other, j) => { if (other.enabled && p.days.some(d => other.days.includes(d)) && minute(p.start) < minute(other.end) && minute(other.start) < minute(p.end))
                issues.push({ tab, field: key, period: index, message: `${label}与时段 ${j + 1} 在相同星期重叠` }); });
        });
    }
    return issues;
}
