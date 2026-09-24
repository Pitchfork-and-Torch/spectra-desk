# Spectra Channel

The standalone exe and the portable zip stay a free download. No license key. Paying for the Telegram room does not unlock or lock the installer. Change that only if the operator says so.

## What a member can do

They message the bot in a private chat:

```
/demo
/dossier Jane Doe
/dossier first=Jane last=Doe username=janedoe
/whoami
```

The PDF is public-source only. It is not LOCKED. The bot refuses a lookup that is clearly a minor. The membership room does not get the PDF.

## What you do once

1. In Telegram, talk to @BotFather. Send `/newbot`. Copy the token into an env var, not into git.
2. Send `/setprivacy` and choose Disable, if you also want commands inside a group. Lookups still only run in a private chat.
3. Send `/setcommands` with:
   ```
   demo - Fictional sample PDF
   dossier - Public-source brief
   whoami - Your Telegram id
   help - Rules
   ```
4. Make a private group or channel for paying members. Put the bot link there. Do not put the token there.
5. On this PC, in a terminal that is not Grok Build:

```
set SPECTRA_TELEGRAM_BOT_TOKEN=your-token
set SPECTRA_OPERATOR_TELEGRAM_ID=your-numeric-id
cd C:\Users\Knock\spectra-desk\server
npx tsx src/v10/telegram-bot.ts
```

6. Message the bot `/whoami`. Then, from your operator id:

```
/grant 123456789 30
```

That is one paid month. When it lapses, `/dossier` refuses until you grant again.

There is no card data in this repo. You collect the monthly fee yourself, then grant the Telegram id. The PC has to stay on. This bot does not run on the deleted VPS.

## Caps

`SPECTRA_CHANNEL_DAILY_CAP` defaults to 3 live briefs per id per day. `/demo` does not spend that cap.

## Rails

Public sources only. Investigative lead, not legal proof of identity. No broker key. No private-account scrape. Agents and this bot cannot LOCK.
