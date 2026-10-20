import {api,send} from './client'
import type {ServerTariffTemplate,ServerTariffPeriod} from './tariffTemplates'
export type TariffLibraryMetadata={siteType:string;priceType:string;country:string;area:string;validFrom:string;validUntil:string;demandPrice:string|null;capacityPrice:string|null}
export type TariffLibraryEntry={storageKind?:'purchase-template'|'configuration';template:ServerTariffTemplate;metadata:TariffLibraryMetadata|null;createdBy:string|null;createdAt:string|null}
export type AutomaticTariffCatalog={code:string;source:string;country:string;area:string;postal_code:string;currency:string;is_mock:boolean;live_connected:boolean}
export type TariffLibraryDraft={name:string;currency:string;pricingMode:'fixed'|'tou';periods:ServerTariffPeriod[];metadata:TariffLibraryMetadata;expectedVersion?:number}
export const loadTariffLibrary=()=>api<TariffLibraryEntry[]>('/tariff-library')
export const loadAutomaticTariffCatalog=()=>api<AutomaticTariffCatalog[]>('/tariff-library/automatic')
export const saveTariffLibrary=(draft:TariffLibraryDraft,id?:string)=>send<TariffLibraryEntry>(`/tariff-library${id?`/${encodeURIComponent(id)}`:''}`,id?'PUT':'POST',draft)

export type NonpurchaseTariffConfiguration={id:string;name:string;currency:string;pricingMode:'fixed'|'tou';periods:ServerTariffPeriod[];metadata:TariffLibraryMetadata;version:number;createdBy:string;createdAt:string;usage:'configuration-only'}
/** Presentation adapter only. Configuration IDs never go to purchase binding/template endpoints. */
export const configurationLibraryEntry=(row:NonpurchaseTariffConfiguration):TariffLibraryEntry=>({storageKind:'configuration',template:{id:row.id,name:row.name,currency:row.currency,pricingMode:row.pricingMode,periods:row.periods,version:row.version},metadata:row.metadata,createdBy:row.createdBy,createdAt:row.createdAt})
export const loadTariffConfigurations=async()=> (await api<NonpurchaseTariffConfiguration[]>('/tariff-library/configurations')).map(configurationLibraryEntry)
export const saveTariffConfiguration=async(draft:TariffLibraryDraft,id?:string)=>configurationLibraryEntry(await send<NonpurchaseTariffConfiguration>(`/tariff-library/configurations${id?`/${encodeURIComponent(id)}`:''}`,id?'PUT':'POST',draft))
export const archiveTariffConfiguration=(row:TariffLibraryEntry)=>send<void>(`/tariff-library/configurations/${encodeURIComponent(row.template.id)}?version=${row.template.version}`,'DELETE')
