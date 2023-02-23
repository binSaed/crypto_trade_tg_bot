const fs = require("fs");
const path = require("path");
const player = require("play-sound")((opts = {}));
const {Spot} = require("@binance/connector");
const {TelegramClient} = require("telegram");
const {StringSession} = require("telegram/sessions");

const tgApiId = "";
const tgApiHash = "";
const binanceApiKey = "";
const binanceApiSecret = "";

const stringSession = new StringSession(
);

let spot;
(async () => {
    const tg = new TelegramClient(stringSession, tgApiId, tgApiHash, {
        connectionRetries: 5,
    });
    await tg.connect();
    spot = new Spot(binanceApiKey, binanceApiSecret);
    setInterval(async () => {
        const msgs = await tg.getMessages("drcryptopro", {limit: 4});
        for (let msg of msgs) {
            const tradeInfo = getTradeInfo(msg.text);
            if (tradeInfo) {
                const isNew = saveTradeToFile(tradeInfo);
                if (isNew) {
                    notification();
                    await makeOrder(tradeInfo);
                }
            }
        }
    }, 5000);
})();
const saveTradeToFile = (trade) => {
    const tradesPath = path.resolve(__dirname, "./data/trades.json");
    let trades = [];
    if (fs.existsSync(tradesPath)) {
        let tradesJson = fs.readFileSync(tradesPath);
        trades = JSON.parse(tradesJson);
    }

    if (!trades.find((e) => e.msg === trade.msg)) {
        trades.push(trade);
        trades.sort((a, b) => (a.date > b.date ? 1 : -1));
        fs.writeFileSync(tradesPath, JSON.stringify(trades));

        return true;
    }

    return false;
};
const getTradeInfo = (msg) => {
    const msgSplitted = msg.replace("\n", "").replaceAll(" ", "").split(",");

    const isLengthCorrect = msgSplitted.length === 3;
    if (!isLengthCorrect) return null;

    const currencyName = msgSplitted[0];
    const isNameCorrect = currencyName.endsWith("USDT");
    if (!isNameCorrect) return null;

    const price = msgSplitted[1].split("=")[1];
    if (!price) return null;

    const date = Date.parse(msgSplitted[2]);
    if (!date) return null;

    return {name: currencyName, price, date, msg};
};

const makeOrder = async (tradeInfo) => {
    const buyUsdtAmout = 20; //10$
    const quantity = buyUsdtAmout / tradeInfo.price;
    const precision = await getPrecision(tradeInfo.name);
    await spot
        .newOrder(tradeInfo.name, "BUY", "LIMIT", {
            price: tradeInfo.price,
            quantity: quantity.toFixed(precision),
            timeInForce: "GTC",
        })
        .then((response) => spot.logger.log(response.data))
        .catch((error) => spot.logger.error(error));
};
const getPrecision = async (name) => {
    const precisionsPath = path.resolve(__dirname, "./data/precisions.json");
    let precisions = [];
    if (fs.existsSync(precisionsPath)) {
        let precisionsJson = fs.readFileSync(precisionsPath);
        precisions = JSON.parse(precisionsJson);
    }
    let item = precisions.find((e) => e.name === name);

    if (item) return item.precision;

    const exchangeInfo = await spot.exchangeInfo({symbols: [name]});

    const stepSize = exchangeInfo.data.symbols[0].filters.find(
        (e) => e.filterType === "LOT_SIZE"
    ).stepSize;

    const precision = Math.max(0, stepSize.indexOf("1") - 1);

    precisions.push({name, precision});
    fs.writeFileSync(precisionsPath, JSON.stringify(precisions));
    return precision;
};

const notification = () => {
    const audioPath = path.resolve(__dirname, "./data/notification.wav");
    player.play(audioPath);
};
