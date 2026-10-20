import './loading-state.css'
export type LoadingStateProps={label?:string;compact?:boolean;className?:string}
export default function LoadingState({label='加载中…',compact=false,className=''}:LoadingStateProps){return <div className={`loading-state${compact?' loading-state-compact':''}${className?` ${className}`:''}`} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><span className="loading-state-spinner" aria-hidden="true"/><span>{label}</span></div>}
