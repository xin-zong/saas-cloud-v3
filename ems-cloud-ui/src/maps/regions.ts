export const DEFAULT_MAP_VIEW={lat:50,lng:10,zoom:4}
export const MAP_REGIONS=[
 {id:'global',name:'全球',lat:25,lng:10,zoom:2},
 {id:'europe',name:'欧洲',...DEFAULT_MAP_VIEW},
 {id:'asia',name:'亚洲',lat:35,lng:100,zoom:3},
 {id:'africa',name:'非洲',lat:2,lng:20,zoom:3},
 {id:'north-america',name:'北美洲',lat:45,lng:-100,zoom:3},
 {id:'south-america',name:'南美洲',lat:-20,lng:-60,zoom:3},
 {id:'oceania',name:'大洋洲',lat:-25,lng:135,zoom:3},
 {id:'antarctica',name:'南极洲',lat:-75,lng:0,zoom:3},
]
export function stationCoordinates(station:{lat:string;lng:string}):{lat:number;lng:number}|null{
  const parse=(v:string,negative:RegExp)=>negative.test(v)?-Math.abs(parseFloat(v)):parseFloat(v)
  const lat=parse(station.lat,/S/i),lng=parse(station.lng,/W/i)
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null
}
export function inMapRegion(station:{lat:string;lng:string;region:string},region:string):boolean {
  if(!region||region==='global')return true
  const p=stationCoordinates(station);if(!p)return station.region===region
  const {lat,lng}=p
  switch(region){
    case 'europe':return lat>=35&&lat<=72&&lng>=-25&&lng<=45
    case 'asia':return lat>=-11&&lat<=82&&((lng>=45&&lng<=180)||(lng>=25&&lat<42))
    case 'africa':return lat>=-36&&lat<37&&lng>=-25&&lng<55
    case 'north-america':return lat>=7&&lng<=-30&&lng>=-180
    case 'south-america':return lat<13&&lat>=-60&&lng>=-90&&lng<=-30
    case 'oceania':return lat<0&&lat>=-50&&(lng>=110||lng<=-150)
    case 'antarctica':return lat<-60
    default:return station.region===region
  }
}
export function mapRegionView(region:string,stations:{lat:string;lng:string}[],initial=false){
  if(initial&&region==='global')return DEFAULT_MAP_VIEW
  const preset=MAP_REGIONS.find(r=>r.id===region)
  if(preset)return {lat:preset.lat,lng:preset.lng,zoom:preset.zoom}
  const points=stations.map(stationCoordinates).filter((p):p is {lat:number;lng:number}=>p!==null)
  return points.length?{lat:points.reduce((n,p)=>n+p.lat,0)/points.length,lng:points.reduce((n,p)=>n+p.lng,0)/points.length,zoom:7}:DEFAULT_MAP_VIEW
}
