import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { withErrorHandler, BadRequestError, ForbiddenError, getClientIp, getAuthenticatedUserAsync } from '@/lib/api';
import { isOriginAllowed } from '@/lib/cors';
import { RateLimitService } from '@/services/RateLimitService';

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
    if (!aiClient) {
        const apiKey = process.env.GEMINI_API_KEY || '';
        aiClient = new GoogleGenAI({
            apiKey: apiKey,
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build',
                },
            },
        });
    }
    return aiClient;
}

const MAX_PROMPT_LENGTH = 2000;

async function assistantHandler(req: NextRequest) {
    const origin = req.headers.get('origin');
    if (origin && !isOriginAllowed(origin)) {
        throw new ForbiddenError('Unauthorized cross-origin request to AI assistant.');
    }

    const clientIp = getClientIp(req);
    const authUser = await getAuthenticatedUserAsync(req).catch(() => null);

    // Apply authenticated vs guest tiered rate limits to prevent quota drain
    const rateLimitKey = authUser
        ? `gemini_user:${authUser.id || authUser.sub}`
        : `gemini_guest_ip:${clientIp}`;
    const maxRequests = authUser ? 15 : 5;

    const rateCheck = await RateLimitService.checkLimit({
        key: rateLimitKey,
        maxRequests,
        windowSeconds: 60
    });

    if (!rateCheck.allowed) {
        return NextResponse.json(
            {
                success: false,
                error: `Too many requests. AI assistant rate limit exceeded. Please wait ${rateCheck.resetInSeconds} seconds before trying again.`
            },
            {
                status: 429,
                headers: {
                    'Retry-After': String(rateCheck.resetInSeconds),
                    'X-RateLimit-Limit': String(rateCheck.limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(Math.floor(rateCheck.resetAt.getTime() / 1000))
                }
            }
        );
    }

    const body = await req.json().catch(() => ({}));
    const { prompt, stain, fabric, queryType, loadDescription } = body;

    // Validate prompt lengths against quota exhaustion and resource abuse
    const rawInputs = [prompt, stain, fabric, loadDescription].filter(Boolean);
    for (const input of rawInputs) {
        if (typeof input === 'string' && input.length > MAX_PROMPT_LENGTH) {
            throw new BadRequestError(`Input exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`);
        }
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are "LaundryAI Care Master", an expert professional garment care specialist, textile conservator, stain removal advisor, and laundry consultant for Laundelle.
Provide clear, actionable, friendly, and practical advice.
Format your responses nicely with markdown headings, bullet points, step-by-step instructions, and water temperature / detergent recommendations when relevant.
Always include a brief note on how Laundelle professional laundry/dry-cleaning service can assist with difficult stains or delicate items.`;

    let userMessage = '';
    if (queryType === 'stain') {
        userMessage = `Emergency Stain Treatment Request:
Stain Type: ${stain || 'Unknown stain'}
Fabric Type: ${fabric || 'General fabric'}
Additional Context: ${prompt || 'How do I remove this safely?'}`;
    } else if (queryType === 'load_calculator') {
        userMessage = `Help me calculate the laundry load and recommend Laundelle services:
Load Description: ${loadDescription || prompt}
Please estimate total weight, suggest the best service (Wash & Fold, Dry Cleaning, Ironing, Bed Linen, Shoe Care), and give care instructions.`;
    } else {
        userMessage = prompt || 'What are the best laundry practices for everyday clothes?';
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: userMessage,
            config: {
                systemInstruction,
                temperature: 0.7,
            },
        });

        const replyText = response.text || 'I could not process your laundry request at this moment. Please try again.';
        return NextResponse.json({ success: true, response: replyText });
    } catch (error: any) {
        console.error('Gemini Assistant Provider Error:', error?.message);
        return NextResponse.json({
            success: false,
            error: 'Failed to generate AI laundry recommendations.',
            fallbackResponse: `**Quick Stain & Laundry Tip:**\n\n1. **Act Quickly:** Blot (don't rub) stains with a damp cloth immediately.\n2. **Cold Water First:** Always use cool or lukewarm water for organic stains like blood, sweat, or food.\n3. **Professional Care:** For delicate fabrics like Silk, Wool, or Formal Wear, select Laundelle's **Dry Cleaning** or **Gentle Wash** service for best results!`
        }, { status: 500 });
    }
}

export const POST = withErrorHandler(assistantHandler);
