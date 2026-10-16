import type { SessionView,UserView } from '../../src/contracts/generated/dto'
export function sessionFixture(role:UserView['role']|null=null):SessionView {
  return {schema_version:'1.0',authenticated:role!==null,
    principal:role?{principal_id:'account-user',kind:'USER',role,username:'learner',display_name:'Learner'}:{principal_id:'account-guest',kind:'GUEST',role:'STUDENT'},
    csrf_token:'volatile-csrf-token-that-is-32-characters-long',expires_at:1900000000,guest_enabled:true,claim_available:role!==null}
}
