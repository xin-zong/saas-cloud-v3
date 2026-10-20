import { getHostContext } from "./host-context"
export async function collectAgentPageContext() {
  const context = getHostContext()
  return {
    active_page_id: "workspace",
    route: context.route,
    pages: [
      {
        page_id: "workspace",
        name: context.route.name,
        selected_sites: context.sites.map((site) => ({
          site_id: site.site_id,
          site_name: site.display_name,
        })),
      },
    ],
  }
}
export async function executeAgentFrontendActions(actions = []) {
  return actions.map((action) => ({
    status: "not_available",
    action: action.action || "",
    message: "一期页面操作尚未适配；未执行页面修改或设备控制。",
  }))
}
