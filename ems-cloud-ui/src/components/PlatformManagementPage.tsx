import type {Station} from '@/App'
import TenantAdministration from '@/tenant/TenantAdministration'
export default function PlatformManagementPage(props:{section?:'all'|'company'|'permissions';stations?:Station[];allowedTabs?:readonly string[];registerLeaveGuard?:(guard:null|(()=>Promise<boolean>))=>void}){return <TenantAdministration section={props.section}/>}
