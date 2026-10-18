import test from 'node:test';
import assert from 'node:assert/strict';
import {authEmailFailure} from '../src/lib/auth/email-errors.ts';
import {createLoader} from './helpers/react-loader.mjs';
const {requestRecovery}=await createLoader()('lib/auth/password-recovery.ts');

for(const [error,result] of [
  [{status:429},'rateLimited'],
  [{code:'over_email_send_rate_limit'},'rateLimited'],
  [{code:'over_request_rate_limit'},'rateLimited'],
  [{code:'email_address_not_authorized'},'deliveryUnavailable'],
  [{code:'email_provider_disabled'},'deliveryUnavailable'],
  [{code:'unexpected_failure',message:'EXAMPLE_PRIVATE_SMTP_DETAIL'},'error'],
  [{status:500},'error'],[null,'error'],['EXAMPLE_PRIVATE','error'],
])test(`error público acotado: ${JSON.stringify(error)}`,async()=>{
  assert.equal(authEmailFailure(error),result);
  if(error){
    assert.equal(await requestRecovery({auth:{resetPasswordForEmail:async()=>({error})}},'example@test.invalid','https://strong.example','es'),result);
    assert.equal(await requestRecovery({auth:{resetPasswordForEmail:async()=>{throw error;}}},'example@test.invalid','https://strong.example','es'),result);
  }
});
