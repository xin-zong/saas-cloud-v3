import {Component,type ReactNode} from 'react'

export class TopologyErrorBoundary extends Component<{children:ReactNode},{error:string|null}>{
 state:{error:string|null}={error:null}
 static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message:'接线图渲染异常'}}
 render(){
  if(this.state.error)return <article className="rs-panel" role="alert"><h3>一次接线图加载失败</h3><p>{this.state.error}</p><p>其他场站功能可继续使用，未保存的拓扑不会自动提交。</p><button onClick={()=>this.setState({error:null})}>重新打开接线图</button></article>
  return this.props.children
 }
}
