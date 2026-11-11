import { describe,expect,it } from 'vitest';
import { SessionEvent } from '@shared';
import { intakeLabel } from './presentation';
const env={facilityId:'QA-PHC',deviceId:'device:qa',createdBy:'staff:qa',createdOn:'2026-10-29T09:00:00Z',schemaVersion:4};
const open=SessionEvent.parse({...env,id:'intake:open',type:'session_event',offeringId:'service:qa',action:'open',observedOn:env.createdOn});
const pause=SessionEvent.parse({...open,id:'intake:pause',previousId:open.id,action:'pause',reason:'Temporary resource pause'});
describe('accepted intake presentation',()=>{
  it('keeps intake unopened while its first open event is only a local proposal',()=>{
    expect(intakeLabel([open],{pending:new Set([open.id]),receipts:[],rejections:[]})).toBe('Not opened · change awaiting server');
  });
  it('retains the accepted operational state while a later change is queued or refused',()=>{
    expect(intakeLabel([open,pause],{pending:new Set([pause.id]),receipts:[],rejections:[]})).toBe('Open · change awaiting server');
    expect(intakeLabel([open,pause],{pending:new Set(),receipts:[{id:pause.id,clientId:1,outcome:'rejected'}],rejections:[]})).toBe('Open · change needs review');
  });
});
