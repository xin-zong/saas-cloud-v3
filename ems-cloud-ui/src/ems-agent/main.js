import Vue from "vue"
import { Select, Option, Message } from "element-ui"
import "element-ui/lib/theme-chalk/index.css"
import AssistantDialog from "./legacy/AssistantDialog.vue"
import { setHostContext } from "./host-context"
import "./frame.css"

const channel = new URLSearchParams(location.search).get("channel")
const origin = location.origin
Vue.config.productionTip = false
Vue.prototype.$message = Message
Vue.component(Select.name, Select)
Vue.component(Option.name, Option)
const state = Vue.observable({ getters: {}, route: {} })
Object.defineProperty(Vue.prototype, "$store", { get: () => state })
Object.defineProperty(Vue.prototype, "$route", { get: () => state.route })
let app = null
const notify = (type) => parent.postMessage({ type, channel }, origin)
window.addEventListener("message", (event) => {
  if (
    event.origin !== origin ||
    event.source !== parent ||
    !channel ||
    event.data?.channel !== channel ||
    event.data.type !== "ems-agent:init"
  )
    return
  const context = event.data.context
  if (!context?.user?.id || !Array.isArray(context.sites)) return
  setHostContext(context)
  state.getters = { ...context.user }
  state.route = context.route
  if (!app) {
    app = new Vue({
      data: () => ({ visible: false }),
      render(h) {
        return h(AssistantDialog, {
          ref: "dialog",
          props: { visible: this.visible },
          on: {
            "update:visible": (value) => {
              this.visible = value
              if (!value) notify("ems-agent:close")
            },
          },
        })
      },
    }).$mount("#ems-agent-root")
    Vue.nextTick(() => {
      app.visible = true
    })
  } else {
    const dialog = app.$refs.dialog
    dialog.sites = context.sites
    const allowed = new Set(context.sites.map((site) => site.site_id))
    dialog.selectedSiteIds = dialog.selectedSiteIds.filter((id) =>
      allowed.has(String(id)),
    )
  }
})
if (channel && parent !== window) notify("ems-agent:ready")
