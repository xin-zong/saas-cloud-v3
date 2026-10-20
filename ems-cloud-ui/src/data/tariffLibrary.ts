/** Keep a shrinking, filtered library on a page that still has records. */
export function tariffLibraryPage(total:number,pageSize:number,requested:number):number {
 const size=Number.isFinite(pageSize)&&pageSize>0?Math.max(1,Math.trunc(pageSize)):50
 const last=Math.max(0,Math.ceil(Math.max(0,total)/size)-1)
 const page=Number.isFinite(requested)?Math.max(0,Math.trunc(requested)):0
 return Math.min(page,last)
}
