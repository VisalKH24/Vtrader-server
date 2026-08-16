const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "YOUR_PERSONAL_CHAT_ID";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const accountsDB = {}; 
const userSessions = {}; 

function notifyAdmin(actionText, acc, userMsg) {
    if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === "YOUR_PERSONAL_CHAT_ID") return;
    
    const sender = userMsg.from ? `@${userMsg.from.username || userMsg.from.first_name}` : "Unknown";
    const timeStr = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });

    let logMsg = `🔔 <b>[ADMIN AUDIT LOG]</b>\n`;
    logMsg += `———————————————\n`;
    logMsg += `👤 <b>User:</b> ${sender} (ChatID: <code>${userMsg.chat.id}</code>)\n`;
    logMsg += `🏦 <b>Account MT5:</b> <code>${acc}</code>\n`;
    logMsg += `📝 <b>សកម្មភាព:</b> ${actionText}\n`;
    logMsg += `⏰ <b>ម៉ោង:</b> ${timeStr}`;

    bot.sendMessage(ADMIN_CHAT_ID, logMsg, { parse_mode: 'HTML' }).catch(() => {});
}

// --- API សម្រាប់ MT5 EA Sync ---
app.post('/api/sync', (req, res) => {
    const { 
        account, password, balance, floating, buys, sells, marketState,
        initialTarget, initialLot, initialStep, initialBlock, initialInc 
    } = req.body;

    if (!account) return res.status(400).json({ error: "Missing account ID" });

    if (!accountsDB[account]) {
        accountsDB[account] = {
            password: password || "123456",
            active: true, 
            target: initialTarget !== undefined ? initialTarget : 25.0, 
            lot: initialLot !== undefined ? initialLot : 0.03, 
            step: initialStep !== undefined ? initialStep : 1.0, 
            block: initialBlock !== undefined ? initialBlock : 6, 
            inc: initialInc !== undefined ? initialInc : 0.01,
            useNews: true, newsBefore: 30, newsAfter: 30,
            useFriday: true, fridayTime: "22:00",
            useTimeFilter: false, pauseStart: "19:00", pauseEnd: "21:30",
            dailyTarget: 0.0, closeAll: false,
            status: { balance, floating, buys, sells, marketState }
        };
    } else {
        accountsDB[account].status = { balance, floating, buys, sells, marketState };
        if (password) accountsDB[account].password = password;
    }

    const current = accountsDB[account];
    res.json({
        active: current.active,
        target: current.target,
        lot: current.lot,
        step: current.step,
        block: current.block,
        inc: current.inc,
        useNews: current.useNews,
        newsBefore: current.newsBefore,
        newsAfter: current.newsAfter,
        useFriday: current.useFriday,
        fridayTime: current.fridayTime,
        useTimeFilter: current.useTimeFilter,
        pauseStart: current.pauseStart,
        pauseEnd: current.pauseEnd,
        dailyTarget: current.dailyTarget,
        closeAll: current.closeAll
    });

    if (current.closeAll) current.closeAll = false;
});

app.get('/', (req, res) => res.send("VTrader Central Server Online 🟢"));

const keyboardMarkup = {
    reply_markup: {
        keyboard: [
            [{ text: "🟢 Start EA" }, { text: "⏸️ Pause EA" }],
            [{ text: "📊 Status" }, { text: "⚙️ Settings" }],
            [{ text: "🎯 Target 25" }, { text: "🎯 Target 50" }, { text: "🎯 Target 100" }],
            [{ text: "📐 Lot 0.01" }, { text: "📐 Lot 0.03" }, { text: "📐 Lot 0.05" }],
            [{ text: "🛑 Close All" }, { text: "📖 Menu" }]
        ],
        resize_keyboard: true,
        is_persistent: true
    }
};

bot.on('message', (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text ? msg.text.trim() : "";
    const lower = text.toLowerCase();

    // ADMIN DASHBOARD
    if (lower === '/admin' && chatId === ADMIN_CHAT_ID.toString()) {
        const totalAccounts = Object.keys(accountsDB).length;
        let adminReport = `👑 <b>ADMIN MASTER DASHBOARD</b>\n`;
        adminReport += `👥 <b>Total Accounts:</b> ${totalAccounts}\n`;
        adminReport += `———————————————\n`;

        for (const [acc, data] of Object.entries(accountsDB)) {
            const st = data.status || {};
            adminReport += `🔹 <b>MT5:</b> <code>${acc}</code> | Status: ${data.active ? '🟢' : '⏸️'}\n`;
            adminReport += `   • Balance: $${st.balance || 0} | Float: $${st.floating || 0}\n`;
            adminReport += `   • Target: $${data.target} | Lot: ${data.lot}\n\n`;
        }
        return bot.sendMessage(chatId, adminReport, { parse_mode: 'HTML' });
    }

    // LOGIN COMMAND
    if (lower.startsWith('/login') || lower.startsWith('login')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            return bot.sendMessage(chatId, "⚠️ <b>ទម្រង់ Login:</b> <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
        }
        const acc = parts[1];
        const pass = parts[2];

        if (accountsDB[acc] && accountsDB[acc].password === pass) {
            userSessions[chatId] = acc;
            notifyAdmin(`បាន Login ចូលគ្រប់គ្រង Account ជោគជ័យ`, acc, msg);
            return bot.sendMessage(chatId, `🔓 <b>Login ជោគជ័យទៅកាន់ Account: ${acc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else if (!accountsDB[acc]) {
            return bot.sendMessage(chatId, "❌ <b>រកមិនឃើញ Account នេះនៅលើ Server ទេ!</b> សូមបើក MT5 ឱ្យ EA រันជាមុនសិន។", { parse_mode: 'HTML' });
        } else {
            return bot.sendMessage(chatId, "❌ <b>Password មិនត្រឹមត្រូវ!</b>", { parse_mode: 'HTML' });
        }
    }

    // MENU / HELP (បង្ហាញគ្រប់ Commands ទាំងអស់)
    if (lower === '/start' || lower === '/menu' || text === '📖 Menu' || lower === 'menu' || lower === '/help') {
        const acc = userSessions[chatId];
        if (!acc) {
            return bot.sendMessage(chatId, "🤖 <b>សូមស្វាគមន៍!</b>\n\n👉 សូម Login៖ <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
        }

        let menuMsg = `🎛️ <b>VTRADER CONTROL PANEL (${acc})</b>\n`;
        menuMsg += `———————————————\n`;
        menuMsg += `• <code>/start_ea</code> | <code>/pause_ea</code>\n`;
        menuMsg += `• <code>/target [តម្លៃ]</code> (ឧ: /target 35)\n`;
        menuMsg += `• <code>/lot [ទំហំ]</code> (ឧ: /lot 0.05)\n`;
        menuMsg += `• <code>/step [តម្លៃ]</code> (ឧ: /step 1.5)\n`;
        menuMsg += `• <code>/block [ចំនួន]</code> (ឧ: /block 6)\n`;
        menuMsg += `• <code>/inc [ទំហំ]</code> (ឧ: /inc 0.01)\n`;
        menuMsg += `• <code>/news on|off</code> | <code>/news_before 30</code> | <code>/news_after 30</code>\n`;
        menuMsg += `• <code>/friday on|off</code> | <code>/friday_time 22:00</code>\n`;
        menuMsg += `• <code>/timefilter on|off</code> | <code>/pausetime 19:00 21:30</code>\n`;
        menuMsg += `• <code>/dailytarget [ទឹកប្រាក់]</code> (ឧ: /dailytarget 50)\n`;
        menuMsg += `• <code>/closeall</code> (បិទ Order ទាំងអស់)\n`;
        menuMsg += `• <code>/logout</code> (ចាកចេញ)`;

        return bot.sendMessage(chatId, menuMsg, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    const currentAcc = userSessions[chatId];
    if (!currentAcc || !accountsDB[currentAcc]) {
        return bot.sendMessage(chatId, "🔒 <b>សូម Login ជាមុនសិន!</b>\nវាយ៖ <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
    }

    const data = accountsDB[currentAcc];

    if (lower.includes('status') || lower.includes('setting')) {
        const st = data.status || {};
        let report = `📊 <b>VTrader Status (${currentAcc})</b>\n`;
        report += `💰 <b>Balance:</b> $${st.balance || 0} | <b>Float:</b> $${st.floating || 0}\n`;
        report += `📦 <b>Positions:</b> ${(st.buys||0) + (st.sells||0)} (Buy: ${st.buys||0} | Sell: ${st.sells||0})\n\n`;
        report += getSummaryText(currentAcc, data);
        return bot.sendMessage(chatId, report, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('start ea') || lower === '/start_ea' || lower === '/ea on') {
        data.active = true;
        notifyAdmin(`បានបើកដំណើរការ EA (Start EA 🟢)`, currentAcc, msg);
        return bot.sendMessage(chatId, `🟢 <b>EA Status: ACTIVE (${currentAcc})</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }
    if (lower.includes('pause ea') || lower === '/pause_ea' || lower === '/ea off') {
        data.active = false;
        notifyAdmin(`បានផ្អាកដំណើរការ EA (Pause EA ⏸️)`, currentAcc, msg);
        return bot.sendMessage(chatId, `⏸️ <b>EA Status: PAUSED (${currentAcc})</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('target')) {
        const match = text.match(/target\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldT = data.target;
            data.target = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Target ពី $${oldT} ➔ $${data.target}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Basket Target: $${data.target}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('lot')) {
        const match = text.match(/lot\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldL = data.lot;
            data.lot = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Initial Lot ពី ${oldL} ➔ ${data.lot}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Initial Lot: ${data.lot}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('step')) {
        const match = text.match(/step\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldS = data.step;
            data.step = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Grid Step ពី $${oldS} ➔ $${data.step}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Grid Step: $${data.step}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('block')) {
        const match = text.match(/block\s*(\d+)/i) || text.match(/\d+/);
        if (match) {
            const oldB = data.block;
            data.block = parseInt(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Block Size ពី ${oldB} ➔ ${data.block}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Block Size: ${data.block} Orders</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('inc')) {
        const match = text.match(/inc\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldI = data.inc;
            data.inc = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Lot Increment ពី +${oldI} ➔ +${data.inc}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Lot Increment: +${data.inc}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // NEWS SETTINGS
    if (lower.includes('news_before')) {
        const match = text.match(/\d+/);
        if (match) {
            data.newsBefore = parseInt(match[0]);
            notifyAdmin(`បានកែប្រែ News Before ➔ ${data.newsBefore}m`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>News Before: ${data.newsBefore} mins</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }
    if (lower.includes('news_after')) {
        const match = text.match(/\d+/);
        if (match) {
            data.newsAfter = parseInt(match[0]);
            notifyAdmin(`បានកែប្រែ News After ➔ ${data.newsAfter}m`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>News After: ${data.newsAfter} mins</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }
    if (lower.includes('news')) {
        if (lower.includes('on')) data.useNews = true;
        else if (lower.includes('off')) data.useNews = false;
        notifyAdmin(`បានកែប្រែ News Shield ➔ ${data.useNews ? 'ON' : 'OFF'}`, currentAcc, msg);
        return bot.sendMessage(chatId, `✏️ <b>News Shield: ${data.useNews ? 'ON 🟢' : 'OFF 🔴'}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // FRIDAY LOCK
    if (lower.includes('friday_time')) {
        const parts = text.split(' ');
        if (parts.length > 1) {
            data.fridayTime = parts[1];
            notifyAdmin(`បានកែប្រែ Friday Time ➔ ${data.fridayTime}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Friday Lock Time: ${data.fridayTime}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }
    if (lower.includes('friday')) {
        if (lower.includes('on')) data.useFriday = true;
        else if (lower.includes('off')) data.useFriday = false;
        notifyAdmin(`បានកែប្រែ Friday Lock ➔ ${data.useFriday ? 'ON' : 'OFF'}`, currentAcc, msg);
        return bot.sendMessage(chatId, `✏️ <b>Friday Lock: ${data.useFriday ? 'ON 🔒' : 'OFF 🔓'}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // TIME FILTER
    if (lower.includes('pausetime')) {
        const parts = text.split(' ');
        if (parts.length >= 3) {
            data.pauseStart = parts[1];
            data.pauseEnd = parts[2];
            notifyAdmin(`បានកែប្រែ Pause Time ➔ ${data.pauseStart} to ${data.pauseEnd}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Pause Time: ${data.pauseStart} - ${data.pauseEnd}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }
    if (lower.includes('timefilter')) {
        if (lower.includes('on')) data.useTimeFilter = true;
        else if (lower.includes('off')) data.useTimeFilter = false;
        notifyAdmin(`បានកែប្រែ Time Filter ➔ ${data.useTimeFilter ? 'ON' : 'OFF'}`, currentAcc, msg);
        return bot.sendMessage(chatId, `✏️ <b>Time Filter: ${data.useTimeFilter ? 'ON ⏰' : 'OFF 🔓'}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // DAILY TARGET
    if (lower.includes('dailytarget')) {
        const match = text.match(/\d+(\.\d+)?/);
        if (match) {
            data.dailyTarget = parseFloat(match[0]);
            notifyAdmin(`បានកែប្រែ Daily Target ➔ $${data.dailyTarget}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Daily Target: $${data.dailyTarget}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('close')) {
        data.closeAll = true;
        notifyAdmin(`⚠️ បានបញ្ជាបិទ Close All Positions`, currentAcc, msg);
        return bot.sendMessage(chatId, `🛑 <b>បានបញ្ជាបិទ Positions ទាំងអស់លើ Account ${currentAcc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower === '/logout') {
        notifyAdmin(`បាន Logout ចេញពីប្រព័ន្ធ`, currentAcc, msg);
        delete userSessions[chatId];
        return bot.sendMessage(chatId, "🔒 <b>អ្នកបាន Logout រួចរាល់!</b>", { reply_markup: { remove_keyboard: true } });
    }
});

function getSummaryText(acc, d) {
    return `⚙️ <b>Settings (${acc}):</b>\n` +
           `• EA Status: ${d.active ? 'RUNNING 🟢' : 'PAUSED ⏸️'}\n` +
           `• Target: $${d.target}/Order\n` +
           `• Initial Lot: ${d.lot}\n` +
           `• Grid Step: $${d.step}\n` +
           `• Block: ${d.block} (Inc: +${d.inc})\n` +
           `• News Shield: ${d.useNews ? 'ON 🟢 ('+d.newsBefore+'m/'+d.newsAfter+'m)' : 'OFF 🔴'}\n` +
           `• Friday Lock: ${d.useFriday ? 'ON 🔒 ('+d.fridayTime+')' : 'OFF 🔓'}\n` +
           `• Time Filter: ${d.useTimeFilter ? 'ON ⏰ ('+d.pauseStart+'-'+d.pauseEnd+')' : 'OFF 🔓'}\n` +
           `• Daily Target: ${d.dailyTarget > 0 ? '$'+d.dailyTarget : 'DISABLED ❌'}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
