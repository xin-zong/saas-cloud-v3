import { useEffect, useRef, useState } from "react"

import { Field, CheckList } from "./shared"

import { companyTypes, businessScopes, type Row } from "./types"

import { useDisplayPreferences } from "@/preferences/PreferencesProvider"

export const blankCompany = {
  name: "",

  companyTypes: [],

  businessScopes: [],

  country: "",

  province: "",

  city: "",

  address: "",

  latitude: null,

  longitude: null,

  systemScale: null,

  postcode: "",

  serviceDescription: "",

  registrationNo: "",

  taxId: "",

  contactName: "",

  phone: "",

  website: "",
} as Row

export function companyFrom(row: Row): Row {
  return {
    ...blankCompany,

    ...row,

    companyTypes: row.companyTypes ?? [],

    businessScopes: row.businessScopes ?? [],

    systemScale: row.system_scale ?? null,

    serviceDescription: row.service_description ?? "",

    registrationNo: row.registration_no ?? "",

    taxId: row.taxId ?? "",

    contactName: row.contact_name ?? "",

    latitude: row.latitude == null ? null : Number(row.latitude),

    longitude: row.longitude == null ? null : Number(row.longitude),
  }
}

export default function CompanyForm({
  value,

  onChange,

  addressPicker = true,

  contact = true,

  lockedRegistration = false,
}: {
  value: Row

  onChange: (v: Row) => void

  addressPicker?: boolean

  contact?: boolean

  lockedRegistration?: boolean
}) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v })

  return (
    <>
      <div className="tenant-form-grid">
        <Field label="企业名称 *" wide>
          <input
            required
            maxLength={160}
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
      </div>
      <fieldset
        disabled={lockedRegistration}
        className="tenant-registration-types"
      >
        <CheckList
          label="企业类型 *（可多选）"
          options={companyTypes}
          value={value.companyTypes}
          onChange={(v) => set("companyTypes", v)}
        />
      </fieldset>
      <CheckList
        label="储能业务范围 *（可多选）"
        options={businessScopes}
        value={value.businessScopes}
        onChange={(v) => set("businessScopes", v)}
      />
      {addressPicker && !lockedRegistration && (
        <AddressPicker onSelect={(v) => onChange({ ...value, ...v })} />
      )}
      <div className="tenant-form-grid">
        {[
          ["country", "国家 *"],

          ["province", "省 / 州 *"],

          ["city", "城市 *"],

          ["address", "详细地址 *"],

          ["postcode", "邮编 *"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              required
              maxLength={key === "address" ? 400 : 120}
              readOnly={
                lockedRegistration &&
                ["country", "province", "city", "address"].includes(key)
              }
              value={value[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="系统规模">
          <select
            value={value.systemScale ?? ""}
            onChange={(e) => set("systemScale", e.target.value || null)}
          >
            <option value="">可选</option>
            {[
              ["lt100", "小于 100 kWh"],

              ["100to1000", "100–1,000 kWh"],

              ["1000to10000", "1–10 MWh"],

              ["gt10000", "大于 10 MWh"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="服务描述" wide>
          <textarea
            maxLength={2000}
            value={value.serviceDescription}
            onChange={(e) => set("serviceDescription", e.target.value)}
          />
        </Field>
        {[
          ["registrationNo", "商业注册号"],

          ["taxId", "税号"],

          ["contactName", "联系人 *"],

          ["phone", "国际电话 *"],

          ["website", "官网"],
        ]

          .filter(
            ([key]) =>
              contact || !["contactName", "phone", "website"].includes(key),
          )

          .map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                required={["contactName", "phone"].includes(key)}
                type={
                  key === "website" ? "url" : key === "phone" ? "tel" : "text"
                }
                maxLength={key === "website" ? 300 : 120}
                placeholder={key === "phone" ? "+86 13800000000" : undefined}
                value={value[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
      </div>
    </>
  )
}

function AddressPicker({ onSelect }: { onSelect: (v: Row) => void }) {
  const frame = useRef<HTMLIFrameElement>(null),
    current = useRef(onSelect)

  current.current = onSelect

  const { language } = useDisplayPreferences()

  const [error, setError] = useState("")

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const post = () =>
    frame.current?.contentWindow?.postMessage(
      {
        source: "ems-address-host",

        key,

        language: language === "English" ? "en" : "zh-CN",
      },

      location.origin,
    )

  useEffect(() => {
    setError("")

    const timer = setTimeout(
      () => setError("地址地图加载较慢，可填写下方地址字段"),

      20000,
    )

    const receive = (e: MessageEvent) => {
      if (
        e.source !== frame.current?.contentWindow ||
        e.origin !== location.origin ||
        e.data?.source !== "ems-address-picker"
      )
        return

      if (e.data.type === "ready") post()

      if (e.data.type === "loaded") clearTimeout(timer)

      if (e.data.type === "error") {
        clearTimeout(timer)

        setError("Google Places 暂不可用，可填写下方地址字段")
      }

      if (e.data.type === "selected") current.current(e.data.value)
    }

    window.addEventListener("message", receive)

    return () => {
      clearTimeout(timer)

      window.removeEventListener("message", receive)
    }
  }, [key, language])

  return (
    <div className="tenant-map-picker">
      {key ? (
        <iframe
          ref={frame}
          key={language}
          src="/google-address-picker.html"
          title="搜索企业地址并在地图定位"
          onLoad={post}
        />
      ) : (
        <p>Google Places 未配置，可填写下方地址字段。</p>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  )
}
