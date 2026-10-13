import { dateTimeInput, parseDateTimeInput } from "@/preferences/date"

import { useDisplayPreferences } from "@/preferences/PreferencesProvider"

import { useState } from "react"

import { send } from "@/api/client"

import { Button, Badge } from "@/components/ui/Workspace"

import { date, Field, TenantDialog, QueryState, useTenantQuery } from "./shared"

import type { Row } from "./types"

export default function MemberGrantsPanel({
  member,

  onClose,
}: {
  member: Row

  onClose: () => void
}) {
  const grants = useTenantQuery<Row[]>(
      `/company/member-grants?userId=${member.id}`,
    ),
    options = useTenantQuery<{ roles: Row[] ;stations: Row[] }>(
      "/company/member-grants/options",
    )

  const [edit, setEdit] = useState<Row | null>(null),
    [remove, setRemove] = useState<Row | null>(null)

  return (
    <TenantDialog
      title={`${member.display_name} · 角色与站点授权`}
      wide
      onClose={onClose}
    >
      <div className="tenant-toolbar">
        <span>每条授权独立绑定站点范围和有效期。</span>
        {!member.administrator && (
          <Button
            variant="primary"
            onClick={() =>
              setEdit({
                userId: member.id,

                stationIds: [],

                roleKey: "",

                valid_from: null,

                valid_until: null,
              })
            }
          >
            分配角色
          </Button>
        )}
      </div>
      {member.administrator ? (
        <p className="tenant-notice">
          受保护管理员自动覆盖本企业全部站点，无需普通角色授权。
        </p>
      ) : (
        <>
          <QueryState
            loading={grants.loading || options.loading}
            error={grants.error || options.error}
            empty={!grants.loading && !grants.data?.length}
          />
          {grants.data?.map((g) => (
            <article className="tenant-card" key={g.id}>
              <h2>
                {g.role_name}{" "}
                <Badge>{g.source === "template" ? "预制" : "自定义"}</Badge>
              </h2>
              <p>
                站点：
                {g.stationIds

                  .map(
                    (id: number) =>
                      options.data?.stations.find((s) => s.id === id)?.name ??
                      `#${id}`,
                  )

                  .join("、") || "未配置站点（不包含任何站点）"}
              </p>
              <p className="tenant-muted">
                {date(g.valid_from)} —{" "}
                {g.valid_until ? date(g.valid_until) : "长期有效"}
              </p>
              <Button
                onClick={() =>
                  setEdit({
                    ...g,

                    roleKey: `${g.source}:${g.role_id ?? g.template_id}`,

                    stationIds: g.stationIds,
                  })
                }
              >
                编辑
              </Button>
              <Button onClick={() => setRemove(g)}>撤销授权</Button>
            </article>
          ))}
        </>
      )}
      {edit && (
        <GrantEditor
          row={edit}
          member={member}
          options={options.data ?? { roles: [], stations: [] }}
          onClose={() => setEdit(null)}
          onSaved={grants.reload}
        />
      )}{" "}
      {remove && (
        <TenantDialog
          title="撤销角色授权"
          onClose={() => setRemove(null)}
          onSave={async () => {
            await send(`/company/member-grants/${remove.id}`, "DELETE")

            grants.reload()
          }}
        >
          <p>
            撤销“{remove.role_name}
            ”后，该条授权对应的操作和站点范围立即失效。其他授权仍独立生效。
          </p>
        </TenantDialog>
      )}
    </TenantDialog>
  )
}

function GrantEditor({
  row,

  member,

  options,

  onClose,

  onSaved,
}: {
  row: Row

  member: Row

  options: { roles: Row[] ;stations: Row[] }

  onClose: () => void

  onSaved: () => void
}) {
  const { timezone } = useDisplayPreferences()

  const [fromChanged, setFromChanged] = useState(false),
    [untilChanged, setUntilChanged] = useState(false)

  const [role, setRole] = useState(row.roleKey ?? ""),
    [sites, setSites] = useState<number[]>(row.stationIds ?? []),
    [from, setFrom] = useState(
      row.valid_from
        ? dateTimeInput(row.valid_from).slice(0, 19)
        : dateTimeInput(new Date()).slice(0, 19),
    ),
    [until, setUntil] = useState(
      row.valid_until ? dateTimeInput(row.valid_until).slice(0, 19) : "",
    )

  return (
    <TenantDialog
      title="配置角色授权"
      onClose={onClose}
      onSave={async () => {
        const [source, id] = role.split(":")

        await send(
          row.id
            ? `/company/member-grants/${row.id}`
            : "/company/member-grants",

          row.id ? "PUT" : "POST",

          {
            userId: member.id,

            roleId: source === "custom" ? Number(id) : null,

            templateId: source === "template" ? Number(id) : null,

            stationIds: sites,

            validFrom: fromChanged
              ? parseDateTimeInput(from).toISOString()
              : (row.valid_from ?? null),

            validUntil: untilChanged
              ? until
                ? parseDateTimeInput(until).toISOString()
                : null
              : (row.valid_until ?? null),
          },
        )

        onSaved()
      }}
    >
      <Field label="角色 *">
        <select required value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">选择角色</option>
          {options.roles.map((r) => (
            <option key={`${r.source}:${r.id}`} value={`${r.source}:${r.id}`}>
              {r.name} · {r.source === "template" ? "平台预制" : "自定义"}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="tenant-checklist">
        <legend>该角色授权的站点范围</legend>
        {options.stations.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={sites.includes(s.id)}
              onChange={(e) =>
                setSites(
                  e.target.checked
                    ? [...sites, s.id]
                    : sites.filter((id) => id !== s.id),
                )
              }
            />
            {s.name}
          </label>
        ))}
      </fieldset>
      <p className="tenant-muted">
        未选站点表示没有站点权限。企业级管理权限不需要绑定站点。
      </p>
      <div className="tenant-form-grid">
        <Field label={`开始时间（${timezone}）`}>
          <input
            required
            type="datetime-local"
            step={1}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setFromChanged(true)
            }}
          />
        </Field>
        <Field label={`结束时间（${timezone}，可选）`}>
          <input
            type="datetime-local"
            step={1}
            value={until}
            min={from}
            onChange={(e) => {
              setUntil(e.target.value)
              setUntilChanged(true)
            }}
          />
        </Field>
      </div>
    </TenantDialog>
  )
}
