const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = '659727097693-e16h1munnfusnt2ikd8qlg7r5tqqfhic.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
  prompt: 'consent'
});

console.log('Abre esta URL:');
console.log(url);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Código: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('Refresh Token:', tokens.refresh_token);
  rl.close();
});
