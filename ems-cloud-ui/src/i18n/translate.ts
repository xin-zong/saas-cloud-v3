import { english } from './en'
import { shellEnglish } from './shell-en'
import { businessEnglish } from './business-en'
const dictionary={...businessEnglish,...english,...shellEnglish}
export function translate(text:string,language:string):string {
  if(language!=='English')return text
  const match=text.match(/^(\s*)(.*?)(\s*)$/s);if(!match)return text
  const [,before,body,after]=match
  if(dictionary[body])return before+dictionary[body]+after
  // Common action labels carry an ID, count, or decorative prefix.
  const prefix=body.match(/^(＋ |← |→ |⚠ )(.+)$/)
  if(prefix&&dictionary[prefix[2]])return before+prefix[1]+dictionary[prefix[2]]+after
  const required=body.match(/^(.*?)\s*\*$/)
  if(required&&dictionary[required[1]])return before+dictionary[required[1]]+' *'+after
  const connection=body.match(/^已连接业务服务 · (\d+) 个授权站点$/)
  if(connection)return `${before}Connected · ${connection[1]} authorized sites${after}`
  const count=body.match(/^(共|已选|最近更新)\s*(\d.*)$/)
  if(count&&dictionary[count[1]])return before+dictionary[count[1]]+' '+count[2]+after
  const action=body.match(/^(取消收藏|收藏|编辑|删除|查看|配置|复制)\s*(.+)$/)
  if(action&&dictionary[action[1]])return before+dictionary[action[1]]+' '+(dictionary[action[2]]??action[2])+after
  return text
}
