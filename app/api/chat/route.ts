export const runtime = "nodejs";

import { kv } from '@vercel/kv';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { Configuration, OpenAIApi } from 'openai-edge';

import { auth } from '@/auth';
import { nanoid } from '@/lib/utils';

export async function POST(req: Request) {
  const json = await req.json();
  const { messages, previewToken } = json;
  const session = await auth();

  if (process.env.VERCEL_ENV !== 'preview') {
    if (session == null) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const configuration = new Configuration({
    apiKey: previewToken || process.env.OPENAI_API_KEY
  });

  const openai = new OpenAIApi(configuration);

  const res = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages,
    temperature: 0.7,
    stream: true
  });

  const stream = OpenAIStream(res, {
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100);
      const userId = session?.user.id;
      if (userId) {
        const id = json.id ?? nanoid();
        const createdAt = Date.now();
        const path = `/chat/${id}`;
        const payload = {
          id,
          title,
          userId,
          createdAt,
          path,
          messages: [
            ...messages,
            {
              content: completion,
              role: 'assistant'
            }
          ]
        };
        await kv.hmset(`chat:${id}`, payload);
        await kv.zadd(`user:chat:${userId}`, {
          score: createdAt,
          member: `chat:${id}`
        });
      }
    }
  });

  return new StreamingTextResponse(stream);
}
