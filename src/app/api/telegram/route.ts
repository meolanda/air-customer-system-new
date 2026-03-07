import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { message } = await request.json();

        // We will store these in .env.local shortly
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            console.error('Missing Telegram Credentials');
            return NextResponse.json(
                { error: 'Telegram credentials are not configured properly.' },
                { status: 500 }
            );
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Telegram API Error:', data);
            return NextResponse.json({ error: 'Failed to send message', details: data }, { status: response.status });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error in Telegram API route:', error);
        return NextResponse.json(
            { error: 'Internal server error while sending notification.' },
            { status: 500 }
        );
    }
}
