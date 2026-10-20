import Vue from 'vue'
import {Select, Option, Message} from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import AssistantDialog from './AssistantDialog.vue'
import {context, receiveContext, sendHost, storageIdentity, getContextVersion} from './context.js'
import {installTranslations} from './translations.js'
import './island.css'
Vue.component(Select.name,Select); Vue.component(Option.name,Option)
Vue.prototype.$message = Message
Object.defineProperty(Vue.prototype,'$store',{get:()=>({getters:{...context.user,id:storageIdentity(),language:context.language}})})
Object.defineProperty(Vue.prototype,'$route',{get:()=>({path:context.activeNav,name:context.activeNav,fullPath:context.activeNav,query:{stationId:context.activeStationId},params:{}})})
let vm
window.addEventListener('message',event=>{
 const previousTimezone=context.timezone
 const previousVersion=getContextVersion(),previousIdentity=storageIdentity()
 const previousNav=context.activeNav, previousStation=context.activeStationId, previousSites=JSON.stringify(context.stations)
 if (!receiveContext(event)) return
 if (!vm) {
  vm = new Vue({data:{shown:false},render(h){return h(AssistantDialog,{key:storageIdentity(),ref:'dialog',props:{visible:this.shown},on:{close:()=>sendHost('close'),'update:visible':value=>{this.shown=value}}})}}).$mount('#ems-agent')
  installTranslations(()=>context.language)
  Vue.nextTick(()=>{vm.shown=context.visible})
 } else {
  if(previousVersion!==getContextVersion() && previousIdentity===storageIdentity())vm.$refs.dialog?.invalidateAccessScope()
  vm.shown=context.visible
  Vue.nextTick(()=>{const d=vm.$refs.dialog;if(d){d.updatePosition();if(previousTimezone!==context.timezone){d.disposeCharts();d.renderChartsInDialog()}if(previousSites!==JSON.stringify(context.stations))d.fetchSites();if(previousNav!==context.activeNav || previousStation!==context.activeStationId)d.applyRouteSiteContext()}})
 }
})
sendHost('ready')
