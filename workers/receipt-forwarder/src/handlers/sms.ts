import MessagingResponse from 'twilio/lib/twiml/MessagingResponse';
import { defaultHeaders } from '../utils';

const SMS = {
  // TODO Validate the incoming request is in fact coming from Twilio
  // https://github.com/twilio/twilio-node/blob/main/lib/webhooks/webhooks.js
  webhook: async (req: Request, env: Env, ctx: ExecutionContext) => {
    if (!env.TWILIO_ACCOUNT_SID) {
      throw new Error('Missing env var TWILIO_ACCOUNT_SID.');
    }
    if (!env.TWILIO_SECRET) {
      throw new Error('Missing env var TWILIO_SECRET.');
    }
    if (!env.TWILIO_AUTH_TOKEN) {
      throw new Error('Missing env var TWILIO_AUTH_TOKEN.');
    }
    if (!env.SPARKY_PHONE_NUMBER) {
      throw new Error('Missing env var SPARKY_PHONE_NUMBER.');
    }
    /*
      {
        ToCountry: 'US',
        ToState: 'WA',
        SmsMessageSid: 'SMf8572b7c2b4ce5de0c4a883e7b0f140c',
        NumMedia: '0',
        ToCity: 'SEATTLE',
        FromZip: '11111',
        SmsSid: 'SMf8572b7c2b4ce5de0c4a883e7b0f140c',
        FromState: 'AZ',
        SmsStatus: 'received',
        FromCity: 'PHOENIX',
        Body: 'Hmmm',
        FromCountry: 'US',
        To: '+1XXXXXXXXXX',
        ToZip: '11111',
        NumSegments: '1',
        ReferralNumMedia: '0',
        MessageSid: 'SMf8572b7c2b4ce5de0c4a883e7b0f140c',
        AccountSid: 'AC34bc5cf83c716945eab6f0fe9174d5a3',
        From: '+1XXXXXXXXXX',
        ApiVersion: '2010-04-01'
      }
    */
    const content = await req.text();
    const input = new URLSearchParams(content);
    console.log(Object.fromEntries(input));

    const sendRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json;charset=UTF-8',
        'Authorization': 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)
      },
      body: new URLSearchParams({
        Body: input.get('Body'),
        From: input.get('To'),
        To: env.SPARKY_PHONE_NUMBER
      })
    });
    await sendRes.text();
    const response = new MessagingResponse();
    return new Response(response.toString(), { headers: {
      ...defaultHeaders,
      'Content-Type': 'application/xml;charset=UTF-8',
      'Cache-Control': 'public, max-age=300'
    } });
  }
};

export default SMS;