export function locationCoordinates(longitude: unknown, latitude: unknown): {lng:number;lat:number}|null {
 const valid=(v:unknown)=>typeof v==='number'||typeof v==='string'&&v.trim()!==''
 if(!valid(longitude)||!valid(latitude))return null
 const lng=Number(longitude),lat=Number(latitude)
 return Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=90?{lng,lat}:null
}
export function locationDegrees(value:number):string {
 const hundredths=Math.round(Math.abs(value)*3600*100),degrees=Math.floor(hundredths/360000),minutes=Math.floor(hundredths%360000/6000),seconds=(hundredths%6000/100).toFixed(2)
 return `${value<0?'-':''}${degrees}°${minutes}′${seconds}″`
}
