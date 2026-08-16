const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

// 🔑 Bot Token និង Admin Chat ID
const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "YOUR_PERSONAL_CHAT_ID";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const accountsDB = {}; 
const userSessions = {}; 

// 📢 មុខងារផ្ញើសារដំណឹងទៅកាន់ Admin ផ្ទាល់
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

// --- API សម្រាប់ MT5 EA ធ្វើសមកាលកម្ម (Sync) ---
app.post('/api/sync', (req, res) => {
    const { account, password, balance, floating, buys, sells, marketState } = req.body;
    if (!account) return res.status(400).json({ error: "Missing account ID" });

    if (!accountsDB[account]) {
        accountsDB[account] = {
            password: password || "123456",
            active: true, target: 25.0, lot: 0.03, step: 1.0, block: 6, inc: 0.01, closeAll: false, newsActive: true,
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
        closeAll: current.closeAll,
        newsActive: current.newsActive
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

    // 0. ADMIN DASHBOARD COMMAND
    if (lower === '/admin' && chatId === ADMIN_CHAT_ID.toString()) {
        const totalAccounts = Object.keys(accountsDB).length;
        let adminReport = `👑 <b>ADMIN MASTER DASHBOARD</b>\n`;
        adminReport += `👥 <b>Total Active Accounts:</b> ${totalAccounts}\n`;
        adminReport += `———————————————\n`;

        for (const [acc, data] of Object.entries(accountsDB)) {
            const st = data.status || {};
            adminReport += `🔹 <b>MT5:</b> <code>${acc}</code> (Pass: <code>${data.password}</code>)\n`;
            adminReport += `   • Status: ${data.active ? '🟢 RUNNING' : '⏸️ PAUSED'}\n`;
            adminReport += `   • Balance: $${st.balance || 0} | Float: $${st.floating || 0}\n`;
            adminReport += `   • Target: $${data.target} | Lot: ${data.lot} | Step: $${data.step}\n\n`;
        }
        return bot.sendMessage(chatId, adminReport, { parse_mode: 'HTML' });
    }

    // 1. LOGIN COMMAND
    if (lower.startsWith('/login') || lower.startsWith('login')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            return bot.sendMessage(chatId, "⚠️ <b>ទម្រង់ Login:</b> <code>/login [លេខ MT5] [Password]</code>\nឧទាហរណ៍៖ <code>/login 50110562 123456</code>", { parse_mode: 'HTML' });
        }
        const acc = parts[1];
        const pass = parts[2];

        if (accountsDB[acc] && accountsDB[acc].password === pass) {
            userSessions[chatId] = acc;
            notifyAdmin(`បាន Login ចូលគ្រប់គ្រង Account ជោគជ័យ`, acc, msg);
            return bot.sendMessage(chatId, `🔓 <b>Login ជោគជ័យទៅកាន់ Account: ${acc}!</b>\n\nអ្នកអាចប្រើប្រាស់ប៊ូតុង ឬពាក្យបញ្ជាខាងក្រោមដើម្បីបញ្ជា EA។`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else if (!accountsDB[acc]) {
            accountsDB[acc] = {
                password: pass, active: true, target: 25.0, lot: 0.03, step: 1.0, block: 6, inc: 0.01, closeAll: false, newsActive: true, status: {}
            };
            userSessions[chatId] = acc;
            notifyAdmin(`បានចុះឈ្មោះ និង Login ដំបូង`, acc, msg);
            return bot.sendMessage(chatId, `🔓 <b>ភ្ជាប់ជោគជ័យទៅកាន់ Account: ${acc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else {
            return bot.sendMessage(chatId, "❌ <b>Password មិនត្រឹមត្រូវ!</b> សូមព្យាយាមម្តងទៀត។", { parse_mode: 'HTML' });
        }
    }

    // 2. MENU / START
    if (lower === '/start' || lower === '/menu' || text === '📖 Menu' || lower === 'menu' || lower === '/help') {
        const acc = userSessions[chatId];
        if (!acc) {
            return bot.sendMessage(chatId, "🤖 <b>សូមស្វាគមន៍មកកាន់ VTrader Central Bot!</b>\n\n👉 សូម Login ជាមុនសិន៖\n<code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
        }

        let menuMsg = `🎛️ <b>VTRADER CONTROL PANEL (${acc})</b>\n`;
        menuMsg += `———————————————\n`;
        menuMsg += `ចុចលើ <b>Buttons</b> ខាងក្រោម ឬវាយពាក្យបញ្ជាផ្ទាល់៖\n\n`;
        menuMsg += `🔹 <b>គ្រប់គ្រង EA:</b>\n`;
        menuMsg += `• <code>/start_ea</code> — បើកដំណើរការ EA 🟢\n`;
        menuMsg += `• <code>/pause_ea</code> — ផ្អាកដំណើរការ EA ⏸️\n`;
        menuMsg += `• <code>/status</code> — ឆែកមើលស្ថានភាពបច្ចុប្បន្ន\n`;
        menuMsg += `• <code>/closeall</code> — បញ្ជាបិទ Positions ទាំងអស់ 🛑\n\n`;
        menuMsg += `🔹 <b>កែប្រែ Settings:</b>\n`;
        menuMsg += `• <code>/target [តម្លៃ]</code> — កែ Target USD (ឧ: <code>/target 35</code>)\n`;
        menuMsg += `• <code>/lot [ទំហំ]</code> — កែ Initial Lot (ឧ: <code>/lot 0.05</code>)\n`;
        menuMsg += `• <code>/step [តម្លៃ]</code> — កែ Grid Step USD (ឧ: <code>/step 1.5</code>)\n`;
        menuMsg += `• <code>/block [ចំនួន]</code> — កែ Block Size (ឧ: <code>/block 4</code>)\n`;
        menuMsg += `• <code>/inc [ទំហំ]</code> — កែ Lot Increment (ឧ: <code>/inc 0.02</code>)\n\n`;
        menuMsg += `🔹 <b>ផ្សេងៗ:</b>\n`;
        menuMsg += `• <code>/logout</code> — ចាកចេញពីគណនី 🔒`;

        return bot.sendMessage(chatId, menuMsg, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    const currentAcc = userSessions[chatId];
    if (!currentAcc || !accountsDB[currentAcc]) {
        return bot.sendMessage(chatId, "🔒 <b>សូម Login ជាមុនសិន!</b>\nវាយ៖ <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
    }

    const data = accountsDB[currentAcc];

    // 3. STATUS
    if (lower.includes('status')) {
        const st = data.status || {};
        let report = `📊 <b>VTrader Status (${currentAcc})</b>\n`;
        report += `💰 <b>Balance:</b> $${st.balance || 0} | <b>Float:</b> $${st.floating || 0}\n`;
        report += `📦 <b>Positions:</b> ${(st.buys||0) + (st.sells||0)} (Buy: ${st.buys||0} | Sell: ${st.sells||0})\n\n`;
        report += getSummaryText(currentAcc, data);
        return bot.sendMessage(chatId, report, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 4. SETTINGS
    if (lower.includes('setting')) {
        return bot.sendMessage(chatId, getSummaryText(currentAcc, data), { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 5. START / PAUSE EA
    if (lower.includes('start ea') || lower === '/start_ea' || lower === '/ea on') {
        data.active = true;
        notifyAdmin(`បានបើកដំណើរការ EA (Start EA 🟢)`, currentAcc, msg);
        return bot.sendMessage(chatId, `🟢 <b>EA Status: ACTIVE (${currentAcc})</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
    }
    if (lower.includes('pause ea') || lower === '/pause_ea' || lower === '/ea off') {
        data.active = false;
        notifyAdmin(`បានផ្អាកដំណើរការ EA (Pause EA ⏸️)`, currentAcc, msg);
        return bot.sendMessage(chatId, `⏸️ <b>EA Status: PAUSED (${currentAcc})</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 6. TARGET
    if (lower.includes('target')) {
        const match = text.match(/target\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldT = data.target;
            data.target = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Target ពី $${oldT} ➔ $${data.target}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Basket Target: $${data.target}</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 7. LOT
    if (lower.includes('lot')) {
        const match = text.match(/lot\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldL = data.lot;
            data.lot = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Initial Lot ពី ${oldL} ➔ ${data.lot}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Initial Lot: ${data.lot}</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 8. STEP
    if (lower.includes('step')) {
        const match = text.match(/step\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldS = data.step;
            data.step = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Grid Step ពី $${oldS} ➔ $${data.step}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Grid Step: $${data.step}</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 9. BLOCK SIZE
    if (lower.includes('block')) {
        const match = text.match(/block\s*(\d+)/i) || text.match(/\d+/);
        if (match) {
            const oldB = data.block;
            data.block = parseInt(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Block Size ពី ${oldB} ➔ ${data.block}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Block Size: ${data.block} Orders</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 10. BLOCK LOT INCREMENT
    if (lower.includes('inc')) {
        const match = text.match(/inc\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            const oldI = data.inc;
            data.inc = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Lot Increment ពី +${oldI} ➔ +${data.inc}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Lot Increment: +${data.inc}</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 11. CLOSE ALL
    if (lower.includes('close')) {
        data.closeAll = true;
        notifyAdmin(`⚠️ បានបញ្ជាបិទ Close All Positions`, currentAcc, msg);
        return bot.sendMessage(chatId, `🛑 <b>បានបញ្ជាបិទ Positions ទាំងអស់លើ Account ${currentAcc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 12. LOGOUT
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
           `• Block: ${d.block} (Inc: +${d.inc})`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
