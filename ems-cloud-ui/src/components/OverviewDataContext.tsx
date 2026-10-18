import {createContext,useContext} from 'react'
import type {DashboardCapture,WorkspaceSite} from '@/api/monitorWorkspace'
export const OverviewDataContext=createContext<{items:WorkspaceSite[];capture:DashboardCapture|null;loading:boolean;error:string;source:'capture'|'current'}>({items:[],capture:null,loading:false,error:'',source:'current'})
export const useOverviewData=()=>useContext(OverviewDataContext)
