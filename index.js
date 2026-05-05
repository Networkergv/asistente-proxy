const https = require('https');
const http = require('http');
const { google } = require('googleapis');
const OpenAI = require('openai');
const formData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function createCalendarEvent(title, date, time, duration, location) {
  try {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    let eventDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));

    if (date === 'mañana') {
      eventDate.setDate(now.getDate() + 1);
    } else if (date !== 'hoy') {
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
    eventDate.setHours(hours + 5, minutes, 0, 0);

    const endDate = new Date(eventDate);
    endDate.setMinutes(endDate.getMinutes() + (parseInt(duration) || 60));

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

async function deleteCalendarEvent(title) {
  try {
    const calendarList = await calendar.events.list({
      calendarId: 'primary',
      q: title,
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: new Date().toISOString()
    });
    if (calendarList.data.items && calendarList.data.items.length > 0) {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: calendarList.data.items[0].id
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error('Error borrando evento:', e.message);
    return false;
  }
}

async function transcribeAudio(audioBuffer, mimeType) {
  try {
    const tmpFile = `/tmp/audio_${Date.now()}.m4a`;
    fs.writeFileSync(tmpFile, audioBuffer);
    
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: 'whisper-1',
      language: 'es'
    });
    
    fs.unlinkSync(tmpFile);
    return transcription.text;
  } catch (e) {
    console.error('Error transcribiendo:', e.message);
    return null;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const chunks = [];
  req.on('data', d => chunks.push(d));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    console.log('Petición recibida, path:', req.url);

    // Transcripción de voz
    if (req.url === '/transcribe') {
  const chunks = [];
  // El body ya fue leído, usamos la variable body
  try {
    // Buscar el archivo de audio en el FormData raw
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (boundary) {
      const parts = body.toString('binary').split(`--${boundary}`);
      for (const part of parts) {
        if (part.includes('audio')) {
          const dataStart = part.indexOf('\r\n\r\n') + 4;
          const audioData = Buffer.from(part.slice(dataStart, part.lastIndexOf('\r\n')), 'binary');
          const text = await transcribeAudio(audioData);
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ text }));
          return;
        }
      }
    }
    // Si no hay boundary, tratar el body directamente como audio
    const text = await transcribeAudio(body);
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ text }));
  } catch(e) {
    console.error('Error transcribiendo:', e.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
  return;
}

    try {
      const parsed = JSON.parse(body.toString());
      
      if (parsed.calendar_actions) {
        const results = [];
        for (const action of parsed.calendar_actions) {
          if (action.type === 'add_event') {
            const ok = await createCalendarEvent(action.title, action.date, action.time, action.duration, action.location);
            results.push({ title: action.title, saved: ok });
          } else if (action.type === 'delete_event') {
            const ok = await deleteCalendarEvent(action.title);
            results.push({ title: action.title, deleted: ok });
          }
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ success: true, results }));
        return;
      }
    } catch(e) {}

    // Llamada normal a Claude
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