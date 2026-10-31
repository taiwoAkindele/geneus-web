import type { AuthorizationContext } from '@shared';
const key=(scope:Pick<AuthorizationContext,'facilityId'|'deviceId'>)=>`geneus.documentSupport:${scope.facilityId}:${scope.deviceId}`;
export const documentsSupported=(scope:Pick<AuthorizationContext,'facilityId'|'deviceId'>)=>typeof localStorage!=='undefined'&&localStorage.getItem(key(scope))==='1';
export const rememberDocumentSupport=(scope:Pick<AuthorizationContext,'facilityId'|'deviceId'>,version?:1)=>{
  if(typeof localStorage==='undefined')return;
  if(version===1)localStorage.setItem(key(scope),'1');else localStorage.removeItem(key(scope));
  if(typeof window!=='undefined')window.dispatchEvent(new Event('geneus:documentSupport'));
};
