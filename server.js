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
            target: initialTarget !== undefined ? initialTarget : 4.0, 
            lot: initialLot !== undefined ? initialLot : 0.02, 
            step: initialStep !== undefined ? initialStep : 0.4, 
            block: initialBlock !== undefined ? initialBlock : 15, 
            inc: initialInc !== undefined ? initialInc : 0.01,
            useNews: true, newsBefore: 30, newsAfter: 30,
            useFriday: true, fridayTime: "19:00",
            useTimeFilter: true, pauseStart: "19:00", pauseEnd: "21:30",
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
            [{ text: "🎯 Target 4" }, { text: "🎯 Target 25" }, { text: "🎯 Target 50" }],
            [{ text: "📐 Lot 0.01" }, { text: "📐 Lot 0.02" }, { text: "📐 Lot 0.03" }],
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

    if (lower === '/admin' && chatId === ADMIN_CHAT_ID.toString()) {
        const totalAccounts = Object.keys(accountsDB).length;
        let adminReport = `👑 <b>ADMIN MASTER DASHBOARD</b>\n👥 <b>Total Accounts:</b> ${totalAccounts}\n`;
        for (const [acc, data] of Object.entries(accountsDB)) {
            const st = data.status || {};
            adminReport += `🔹 <b>MT5:</b> <code>${acc}</code> | Target: $${data.target}/Order\n`;
        }
        return bot.sendMessage(chatId, adminReport, { parse_mode: 'HTML' });
    }

    if (lower.startsWith('/login') || lower.startsWith('login')) {
        const parts = text.split(' ');
        if (parts.length < 3) return bot.sendMessage(chatId, "⚠️ <b>ទម្រង់ Login:</b> <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
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

    if (lower === '/start' || lower === '/menu' || text === '📖 Menu' || lower === 'menu' || lower === '/help') {
        const acc = userSessions[chatId];
        if (!acc) return bot.sendMessage(chatId, "🤖 <b>សូមស្វាគមន៍!</b>\n\n👉 សូម Login៖ <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });

        let menuMsg = `🎛️ <b>VTRADER CONTROL PANEL (${acc})</b>\n`;
        menuMsg += `———————————————\n`;
        menuMsg += `• <code>/start_ea</code> | <code>/pause_ea</code>\n`;
        menuMsg += `• <code>/target [តម្លៃ]</code> (ឧ: /target 4)\n`;
        menuMsg += `• <code>/lot [ទំហំ]</code> (ឧ: /lot 0.02)\n`;
        menuMsg += `• <code>/step [តម្លៃ]</code> (ឧ: /step 0.4)\n`;
        menuMsg += `• <code>/block [ចំនួន]</code> (ឧ: /block 15)\n`;
        menuMsg += `• <code>/closeall</code> (បិទ Order ទាំងអស់)\n`;
        menuMsg += `• <code>/logout</code> (ចាកចេញ)`;
        return bot.sendMessage(chatId, menuMsg, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    const currentAcc = userSessions[chatId];
    if (!currentAcc || !accountsDB[currentAcc]) return bot.sendMessage(chatId, "🔒 <b>សូម Login ជាមុនសិន!</b>", { parse_mode: 'HTML' });

    const data = accountsDB[currentAcc];

    if (lower.includes('status') || lower.includes('setting')) {
        const st = data.status || {};
        const totalOrders = (st.buys || 0) + (st.sells || 0);
        const cycleTargetUSD = totalOrders * data.target; // 🎯 គណនាទឹកប្រាក់ត្រូវកាត់សរុប (ឧ: 116 * 4 = $464)

        let report = `📊 <b>VTrader Status (${currentAcc})</b>\n`;
        report += `💰 <b>Balance:</b> $${st.balance || 0} | <b>Float:</b> $${st.floating || 0}\n`;
        report += `📦 <b>Positions:</b> ${totalOrders} (Buy: ${st.buys||0} | Sell: ${st.sells||0})\n`;
        report += `🎯 <b>Cycle Target (ត្រូវកាត់):</b> <b>$${cycleTargetUSD.toFixed(2)}</b> ($${data.target}/Order)\n\n`;
        report += getSummaryText(currentAcc, data);
        return bot.sendMessage(chatId, report, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('start ea') || lower === '/start_ea') {
        data.active = true;
        notifyAdmin(`បានបើកដំណើរការ EA (Start EA 🟢)`, currentAcc, msg);
        return bot.sendMessage(chatId, `🟢 <b>EA Status: ACTIVE (${currentAcc})</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }
    if (lower.includes('pause ea') || lower === '/pause_ea') {
        data.active = false;
        notifyAdmin(`បានផ្អាកដំណើរការ EA (Pause EA ⏸️)`, currentAcc, msg);
        return bot.sendMessage(chatId, `⏸️ <b>EA Status: PAUSED (${currentAcc})</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('target')) {
        const match = text.match(/target\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.target = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Target ➔ $${data.target}/Order`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Basket Target: $${data.target}/Order</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('lot')) {
        const match = text.match(/lot\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.lot = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Initial Lot ➔ ${data.lot}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Initial Lot: ${data.lot}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('step')) {
        const match = text.match(/step\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.step = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Grid Step ➔ $${data.step}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Grid Step: $${data.step}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('block')) {
        const match = text.match(/block\s*(\d+)/i) || text.match(/\d+/);
        if (match) {
            data.block = parseInt(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Block Size ➔ ${data.block}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Block Size: ${data.block} Orders</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('close')) {
        data.closeAll = true;
        notifyAdmin(`⚠️ បានបញ្ជាបិទ Close All Positions`, currentAcc, msg);
        return bot.sendMessage(chatId, `🛑 <b>បានបញ្ជាបិទ Positions ទាំងអស់!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower === '/logout') {
        notifyAdmin(`បាន Logout ចេញពីប្រព័ន្ធ`, currentAcc, msg);
        delete userSessions[chatId];
        return bot.sendMessage(chatId, "🔒 <b>អ្នកបាន Logout រួចរាល់!</b>", { reply_markup: { remove_keyboard: true } });
    }
});

function getSummaryText(acc, d) {
    return `⚙️ <b>Settings (${acc}):</b>\n` +
           `• Target: $${d.target}/Order\n` +
           `• Initial Lot: ${d.lot}\n` +
           `• Grid Step: $${d.step}\n` +
           `• Block: ${d.block} (Inc: +${d.inc})`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
