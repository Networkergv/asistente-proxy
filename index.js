const https = require('https');
const http = require('http');
const { google } = require('googleapis');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function createCalendarEvent(title, date, time, duration, location) {
  try {
    const dateMap = {
      'hoy': 0, 'mañana': 1,
      'lunes': null, 'martes': null, 'miércoles': null,
      'jueves': null, 'viernes': null, 'sábado': null, 'domingo': null
    };

    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    let eventDate = new Date();

    if (date === 'hoy') {
      eventDate = new Date();
    } else if (date === 'mañana') {
      eventDate.setDate(now.getDate() + 1);
    } else {
      const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
      const targetDay = days.indexOf(date);
      if (targetDay !== -1) {
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        eventDate.setDate(now.getDate() + daysUntil);
      }
    }

    const [hours, minutes] = (time || '09:00').split(':').map(Number);
    eventDate.setHours(hours, minutes, 0, 0);

    const endDate = new Date(eventDate);
    const durationMinutes = duration ? parseInt(duration) : 60;
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);

    const event = {
      summary: title,
      location: location || '',
      start: { dateTime: eventDate.toISOString(), timeZone: 'America/Panama' },
      end: { dateTime: endDate.toISOString(), timeZone: 'America/Panama' },
    };

    const result = await calendar.events.insert({ calendarId: 'primary', resource: event });
    console.log('Evento creado:', result.data.htmlLink);
    return true;
  } catch (e) {
    console.error('Error creando evento:', e.message);
    return false;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  let body = '';
  req.on('data', d => body += d);
  req.on('end', async () => {
    console.log('Petición recibida');

    // Si viene con actions, procesar Google Calendar
    try {
      const parsed = JSON.parse(body);
      if (parsed.calendar_actions) {
        const results = [];
        for (const action of parsed.calendar_actions) {
          if (action.type === 'add_event') {
            const ok = await createCalendarEvent(
              action.title, action.date, action.time,
              action.duration, action.location
            );
            results.push({ title: action.title, saved: ok });
          }
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ success: true, results }));
        return;
      }
    } catch(e) {}

    // Si no, es una llamada normal a Claude
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };
    const r = https.request(options, resp => {
      res.writeHead(resp.statusCode, {'Content-Type': 'application/json'});
      resp.pipe(res);
    });
    r.on('error', e => {
      res.writeHead(500);
      res.end(JSON.stringify({error: e.message}));
    });
    r.write(body);
    r.end();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
