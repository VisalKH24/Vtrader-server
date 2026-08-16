const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

// 🔑 ដាក់ Bot Token ផ្លូវការរបស់អ្នកនៅទីនេះ
const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 🗄️ Database ផ្ទុកទិន្នន័យ Accounts និង Session Login
const accountsDB = {}; // { accountId: { password, target, lot, step, block, inc, active, closeAll, ... } }
const userSessions = {}; // { chatId: accountId }

// --- API សម្រាប់ MT5 EA ធ្វើសមកាលកម្មទិន្នន័យ (Sync) ---
app.post('/api/sync', (req, res) => {
    const { account, password, balance, floating, buys, sells, marketState } = req.body;
    
    if (!account) return res.status(400).json({ error: "Missing account ID" });

    // ប្រសិនបើជា Account ថ្មី បង្កើតការកំណត់ដំបូង
    if (!accountsDB[account]) {
        accountsDB[account] = {
            password: password || "123456",
            active: true,
            target: 25.0,
            lot: 0.03,
            step: 1.0,
            block: 6,
            inc: 0.01,
            closeAll: false,
            newsActive: true,
            status: { balance, floating, buys, sells, marketState }
        };
    } else {
        // បច្ចុប្បន្នភាពស្ថានភាពផ្ទាល់ពី MT5
        accountsDB[account].status = { balance, floating, buys, sells, marketState };
        if (password) accountsDB[account].password = password;
    }

    const currentSettings = accountsDB[account];

    // ឆ្លើយតបការកំណត់ទៅកាន់ MT5 វិញ
    res.json({
        active: currentSettings.active,
        target: currentSettings.target,
        lot: currentSettings.lot,
        step: currentSettings.step,
        block: currentSettings.block,
        inc: currentSettings.inc,
        closeAll: currentSettings.closeAll,
        newsActive: currentSettings.newsActive
    });

    // Reset CloseAll បន្ទាប់ពីបញ្ជាទៅកាន់ MT5 រួចរាល់
    if (currentSettings.closeAll) currentSettings.closeAll = false;
});

// Health check
app.get('/', (req, res) => res.send("VTrader Cloud Server is Running 🟢"));

// --- ប្រព័ន្ធបញ្ជា TELEGRAM BOT ---
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
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";
    const lower = text.toLowerCase();

    // 1. COMMAND: /login <account> <password>
    if (lower.startsWith('/login') || lower.startsWith('login')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            return bot.sendMessage(chatId, "⚠️ <b>ទម្រង់ Login មិនត្រឹមត្រូវ!</b>\nសូមវាយ៖ <code>/login [លេខ MT5] [Password]</code>\nឧទាហរណ៍៖ <code>/login 50110562 123456</code>", { parse_mode: 'HTML' });
        }
        const acc = parts[1];
        const pass = parts[2];

        if (accountsDB[acc] && accountsDB[acc].password === pass) {
            userSessions[chatId] = acc;
            return bot.sendMessage(chatId, `🔓 <b>Login ជោគជ័យទៅកាន់ Account: ${acc}!</b>\n\nអ្នកអាចប្រើប្រាស់ប៊ូតុងខាងក្រោមដើម្បីបញ្ជា EA បានភ្លាមៗ។`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else if (!accountsDB[acc]) {
            // អនុញ្ញាតឱ្យចុះឈ្មោះដំបូង
            accountsDB[acc] = {
                password: pass, active: true, target: 25.0, lot: 0.03, step: 1.0, block: 6, inc: 0.01, closeAll: false, newsActive: true, status: {}
            };
            userSessions[chatId] = acc;
            return bot.sendMessage(chatId, `🔓 <b>ភ្ជាប់ជោគជ័យទៅកាន់ Account: ${acc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else {
            return bot.sendMessage(chatId, "❌ <b>Password មិនត្រឹមត្រូវ!</b> សូមព្យាយាមម្តងទៀត។", { parse_mode: 'HTML' });
        }
    }

    // 2. COMMAND: /start ឬ /menu
    if (lower === '/start' || lower === '/menu' || text === '📖 Menu') {
        const acc = userSessions[chatId];
        if (!acc) {
            return bot.sendMessage(chatId, "🤖 <b>សូមស្វាគមន៍មកកាន់ VTrader Central Bot!</b>\n\n👉 សូម Login ដើម្បីគ្រប់គ្រង MT5 របស់អ្នក៖\n<code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
        }
        return bot.sendMessage(chatId, `🎛️ <b>VTrader Control Panel (Account: ${acc})</b>\n\nប្រើប្រាស់ប៊ូតុងខាងក្រោមដើម្បីបញ្ជា៖`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 3. ត្រួតពិនិត្យ SESSION LOGIN
    const currentAcc = userSessions[chatId];
    if (!currentAcc || !accountsDB[currentAcc]) {
        return bot.sendMessage(chatId, "🔒 <b>សូម Login ជាមុនសិន!</b>\nវាយពាក្យបញ្ជា៖ <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
    }

    const data = accountsDB[currentAcc];

    // 4. ពាក្យបញ្ជា STATUS
    if (lower.includes('status')) {
        const st = data.status || {};
        let report = `📊 <b>VTrader System Status (${currentAcc})</b>\n`;
        report += `———————————————\n`;
        report += `💰 <b>Balance:</b> $${st.balance || 0}\n`;
        report += `📈 <b>Net Float PnL:</b> $${st.floating || 0}\n`;
        report += `📦 <b>Positions:</b> ${ (st.buys||0) + (st.sells||0) } (B:${st.buys||0} | S:${st.sells||0})\n`;
        report += `🚦 <b>Market Mode:</b> ${st.marketState || 'Analyzing...'}\n\n`;
        report += getSummaryText(currentAcc, data);
        return bot.sendMessage(chatId, report, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 5. START / PAUSE EA
    if (lower.includes('start ea') || lower === '/start_ea') {
        data.active = true;
        return bot.sendMessage(chatId, `🟢 <b>EA Status: ACTIVE (${currentAcc})</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
    }
    if (lower.includes('pause ea') || lower === '/pause_ea') {
        data.active = false;
        return bot.sendMessage(chatId, `⏸️ <b>EA Status: PAUSED (${currentAcc})</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 6. TARGET
    if (lower.includes('target')) {
        const match = text.match(/\d+(\.\d+)?/);
        if (match) {
            data.target = parseFloat(match[0]);
            return bot.sendMessage(chatId, `✏️ <b>Basket Target ត្រូវបានប្តូរទៅ៖ $${data.target}</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 7. LOT
    if (lower.includes('lot')) {
        const match = text.match(/\d+(\.\d+)?/);
        if (match) {
            data.lot = parseFloat(match[0]);
            return bot.sendMessage(chatId, `✏️ <b>Initial Lot ត្រូវបានប្តូរទៅ៖ ${data.lot}</b>\n\n${getSummaryText(currentAcc, data)}`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // 8. CLOSE ALL
    if (lower.includes('close')) {
        data.closeAll = true;
        return bot.sendMessage(chatId, `🛑 <b>បានបញ្ជាបិទរាល់ Position ទាំងអស់លើ Account ${currentAcc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 9. LOGOUT
    if (lower === '/logout') {
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