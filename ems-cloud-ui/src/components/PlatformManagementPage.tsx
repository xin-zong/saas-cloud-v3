import type {Station} from '@/App'
import TenantAdministration from '@/tenant/TenantAdministration'
export default function PlatformManagementPage(_props:{stations?:Station[];allowedTabs?:readonly string[];registerLeaveGuard?:(guard:null|(()=>Promise<boolean>))=>void}){return <TenantAdministration/>}
