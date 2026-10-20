import { useEffect, useState } from "react"

import { useAuth } from "@/auth/AuthContext"

import { Button } from "@/components/ui/Workspace"

import PeoplePage from "./PeoplePage"

import TenantRolesPage from "./TenantRolesPage"

import CompaniesPage, { CompanyProfilePage } from "./CompaniesPage"

import CompanyApprovalsPage from "./CompanyApprovalsPage"

import {
  PermissionPackagesPage,
  MenuManagementPage,
  RoleTemplatesPage,
} from "./PermissionConfigurationPages"

import { menuRoutes } from "./permissionTree"

import { type Row } from "./types"
import { usePermissionLabels } from './usePermissionLabels'

import { useTenantQuery, QueryState, date } from "./shared"

const permissionRoutes = [
  "platform.packages",
  "platform.menus",
  "platform.templates",
]

export default function TenantAdministration({section='all',routeScope}:{section?:'all'|'company'|'permissions';routeScope?:readonly string[]}) {
  const { user } = useAuth()
  const { menuLabel } = usePermissionLabels()
  const routeName = (path: string) => menuLabel({ id: 0, client: 'web', parent_id: null, route_path: path, name_key: `page.${path}` })

  const routes = menuRoutes(user?.menus ?? []).filter(
    (r) => (r.startsWith("company.") || r.startsWith("platform.")) && (!routeScope||routeScope.includes(r)) && (section==='all'||(section==='permissions'?permissionRoutes.includes(r):!permissionRoutes.includes(r))),
  )

  const [page, setPage] = useState(routes[0] ?? "")

  useEffect(() => {
    if (!routes.includes(page)) setPage(routes[0] ?? "")
  }, [routes.join("|"), page])

  const permitted = routes.includes(page)

  return (
    <main className="tenant-page">
      <nav
        className="tenant-primary-tabs"
        aria-label={user?.tenant?.kind === "platform" ? "平台管理" : "企业管理"}
      >
        {[
          ...["platform.approvals", "platform.companies"].filter((r) =>
            routes.includes(r),
          ),
          ...(section==='permissions'?routes.filter(r=>permissionRoutes.includes(r)):routes.some((r) => permissionRoutes.includes(r))
            ? ["__permissions"]
            : []),
          ...routes.filter(
            (r) =>
              !permissionRoutes.includes(r) &&
              !["platform.approvals", "platform.companies"].includes(r),
          ),
        ].map((r) => (
          <Button
            key={r}
            aria-selected={
              r === "__permissions"
                ? permissionRoutes.includes(page)
                : page === r
            }
            onClick={() =>
              setPage(
                r === "__permissions"
                  ? routes.find((r) => permissionRoutes.includes(r))!
                  : r,
              )
            }
          >
            {r === "__permissions" ? "权限管理" : <span translate="no">{routeName(r)}</span>}
          </Button>
        ))}
      </nav>
      {section!=='permissions'&&permissionRoutes.includes(page) && (
        <nav className="tenant-tabs tenant-sub-tabs" aria-label="权限管理分类">
          {permissionRoutes
            .filter((r) => routes.includes(r))
            .map((r) => (
              <Button
                key={r}
                aria-selected={page === r}
                onClick={() => setPage(r)}
              >
                <span translate="no">{routeName(r)}</span>
              </Button>
            ))}
        </nav>
      )}
      {!permitted ? (
        <section role="status" className="tenant-card">
          <h1>暂无管理权限</h1>
          <p>仍可访问设置与个人中心。请联系本企业管理员。</p>
        </section>
      ) : (
        <section key={`${page}:${user?.id}`}>
          {page === "platform.approvals" ? (
            <CompanyApprovalsPage />
          ) : page === "platform.companies" ? (
            <CompaniesPage />
          ) : page === "platform.menus" ? (
            <MenuManagementPage />
          ) : page === "platform.packages" ? (
            <PermissionPackagesPage />
          ) : page === "platform.templates" ? (
            <RoleTemplatesPage />
          ) : page === "company.profile" ? (
            <CompanyProfilePage />
          ) : ["company.people", "company.grants", "platform.people"].includes(
              page,
            ) ? (
            <PeoplePage grantOnly={page === "company.grants"} />
          ) : ["company.roles", "platform.roles"].includes(page) ? (
            <TenantRolesPage />
          ) : page === "platform.audit" ? (
            <TenantAuditPage />
          ) : (
            <p role="alert">无权访问此页面</p>
          )}
        </section>
      )}
    </main>
  )
}

function TenantAuditPage() {
  const rows = useTenantQuery<Row[]>("/audit")

  return (
    <section className="tenant-card">
      <h1>安全审计</h1>
      <QueryState
        loading={rows.loading}
        error={rows.error}
        empty={!rows.data?.length}
      />
      <table className="tenant-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>动作</th>
            <th>目标企业</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {rows.data?.map((r) => (
            <tr key={r.id}>
              <td>{date(r.occurred_at ?? r.created_at)}</td>
              <td>{r.action}</td>
              <td>{r.target_tenant_id ?? "—"}</td>
              <td>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
